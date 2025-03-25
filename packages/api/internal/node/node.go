package node

type NodeInfo struct {
	ID                  string
	OrchestratorAddress string
	IPAddress           string
	TotalCPU            int64 // Total available CPU cores
	TotalMemoryMiB      int64 // Total available memory in MiB
}

// GetID returns the node ID
func (n *NodeInfo) GetID() string {
	return n.ID
}
