package orchestrator

import (
	"context"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"google.golang.org/grpc/connectivity"

	nomadapi "github.com/hashicorp/nomad/api"
	"github.com/jellydator/ttlcache/v3"

	"github.com/e2b-dev/infra/packages/api/internal/api"
	"github.com/e2b-dev/infra/packages/api/internal/node"
	"github.com/e2b-dev/infra/packages/shared/pkg/consts"
	"github.com/e2b-dev/infra/packages/shared/pkg/grpc/orchestrator"
	"github.com/e2b-dev/infra/packages/shared/pkg/smap"
)

type sbxInProgress struct {
	MiBMemory int64
	CPUs      int64
}

type Node struct {
	CPUUsage atomic.Int64
	RamUsage atomic.Int64
	Client   *GRPCClient

	Info *node.NodeInfo

	status   api.NodeStatus
	statusMu sync.RWMutex

	sbxsInProgress *smap.Map[*sbxInProgress]

	buildCache *ttlcache.Cache[string, interface{}]

	createFails atomic.Uint64

	// Reference to the orchestrator for callbacks
	orchestrator *Orchestrator

	// Tracks when the node became empty
	lastEmptyStateTime atomic.Value
}

func (n *Node) Status() api.NodeStatus {
	n.statusMu.RLock()
	defer n.statusMu.RUnlock()

	if n.status != api.NodeStatusReady {
		return n.status
	}

	if n.Client.connection.GetState() != connectivity.Ready {
		return api.NodeStatusConnecting
	}

	return n.status
}

func (n *Node) SetStatus(status api.NodeStatus) {
	n.statusMu.Lock()
	defer n.statusMu.Unlock()

	if n.status != status {
		n.status = status
		// Notify scaling manager of status change
		if n.orchestrator != nil && n.orchestrator.scalingMgr != nil {
			n.orchestrator.scalingMgr.HandleNodeStatusChange(n.Info, status)
		}
	}
}

func (o *Orchestrator) listNomadNodes(ctx context.Context) ([]*node.NodeInfo, error) {
	_, listSpan := o.tracer.Start(ctx, "list-nomad-nodes")
	defer listSpan.End()

	options := &nomadapi.QueryOptions{
		// TODO: Use variable for node pool name ("default")
		Filter: "Status == \"ready\" and NodePool == \"default\"",
	}
	nomadNodes, _, err := o.nomadClient.Nodes().List(options.WithContext(ctx))
	if err != nil {
		return nil, err
	}

	nodes := make([]*node.NodeInfo, 0, len(nomadNodes))
	for _, n := range nomadNodes {
		// Get detailed node information including resources
		nodeInfo, _, err := o.nomadClient.Nodes().Info(n.ID, options.WithContext(ctx))
		if err != nil {
			o.logger.Warnf("Failed to get node info for %s: %v", n.ID, err)
			continue
		}

		// Extract CPU and memory resources
		var totalCPU, totalMemoryMiB int64
		if resources := nodeInfo.Resources; resources != nil {
			if resources.CPU != nil {
				totalCPU = int64(*resources.CPU)
			}
			if resources.MemoryMB != nil {
				totalMemoryMiB = int64(*resources.MemoryMB)
			}
		}

		nodes = append(nodes, &node.NodeInfo{
			ID:                  n.ID[:consts.NodeIDLength],
			OrchestratorAddress: fmt.Sprintf("%s:%s", n.Address, consts.OrchestratorPort),
			IPAddress:           n.Address,
			TotalCPU:            totalCPU,
			TotalMemoryMiB:      totalMemoryMiB,
		})
	}

	return nodes, nil
}

func (o *Orchestrator) GetNode(nodeID string) *Node {
	n, _ := o.nodes.Get(nodeID)
	return n
}

func (o *Orchestrator) GetNodes() []*api.Node {
	nodes := make(map[string]*api.Node)
	for key, n := range o.nodes.Items() {
		nodes[key] = &api.Node{
			NodeID:               key,
			Status:               n.Status(),
			CreateFails:          n.createFails.Load(),
			SandboxStartingCount: n.sbxsInProgress.Count(),
		}
	}

	for _, sbx := range o.instanceCache.Items() {
		n, ok := nodes[sbx.Instance.ClientID]
		if !ok {
			fmt.Fprintf(os.Stderr, "node [%s] for sandbox [%s] wasn't found \n", sbx.Instance.ClientID, sbx.Instance.SandboxID)
			continue
		}

		n.AllocatedCPU += int32(sbx.VCpu)
		n.AllocatedMemoryMiB += int32(sbx.RamMB)
		n.SandboxCount += 1
	}

	var result []*api.Node
	for _, n := range nodes {
		result = append(result, n)
	}

	return result
}

func (o *Orchestrator) GetNodeDetail(nodeID string) *api.NodeDetail {
	var node *api.NodeDetail

	for key, n := range o.nodes.Items() {
		if key == nodeID {
			builds := n.buildCache.Keys()
			node = &api.NodeDetail{
				NodeID:       key,
				Status:       n.Status(),
				CachedBuilds: builds,
				CreateFails:  n.createFails.Load(),
			}
		}
	}

	if node == nil {
		return nil
	}

	for _, sbx := range o.instanceCache.Items() {
		if sbx.Instance.ClientID == nodeID {
			var metadata *api.SandboxMetadata
			if sbx.Metadata != nil {
				meta := api.SandboxMetadata(sbx.Metadata)
				metadata = &meta
			}
			node.Sandboxes = append(node.Sandboxes, api.RunningSandbox{
				Alias:      sbx.Instance.Alias,
				ClientID:   nodeID,
				CpuCount:   api.CPUCount(sbx.VCpu),
				MemoryMB:   api.MemoryMB(sbx.RamMB),
				EndAt:      sbx.GetEndTime(),
				Metadata:   metadata,
				SandboxID:  sbx.Instance.SandboxID,
				StartedAt:  sbx.StartTime,
				TemplateID: sbx.Instance.TemplateID,
			})
		}
	}

	return node
}

func (n *Node) SyncBuilds(builds []*orchestrator.CachedBuildInfo) {
	for _, build := range builds {
		n.buildCache.Set(build.BuildId, struct{}{}, build.ExpirationTime.AsTime().Sub(time.Now()))
	}
}

func (t *Node) InsertBuild(buildID string) {
	exists := t.buildCache.Has(buildID)
	if exists {
		return
	}

	// Set the build in the cache for 2 minutes, it should get updated with the correct time from the orchestrator during sync
	t.buildCache.Set(buildID, struct{}{}, 2*time.Minute)
	return
}

// MarkEmpty marks the node as empty and records the timestamp
func (n *Node) MarkEmpty() {
	n.lastEmptyStateTime.Store(time.Now())
}

// MarkActive marks the node as active by clearing the empty timestamp
func (n *Node) MarkActive() {
	n.lastEmptyStateTime.Store(time.Time{})
}

// EmptyDuration returns how long the node has been empty
// Returns 0 if the node is not empty
func (n *Node) EmptyDuration() time.Duration {
	if emptyTime, ok := n.lastEmptyStateTime.Load().(time.Time); ok && !emptyTime.IsZero() {
		return time.Since(emptyTime)
	}
	return 0
}

// IsEmpty returns true if the node is marked as empty
func (n *Node) IsEmpty() bool {
	if emptyTime, ok := n.lastEmptyStateTime.Load().(time.Time); ok {
		return !emptyTime.IsZero()
	}
	return false
}
