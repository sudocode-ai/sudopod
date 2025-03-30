package orchestrator

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel/trace"

	"github.com/e2b-dev/infra/packages/api/internal/api"
	"github.com/e2b-dev/infra/packages/api/internal/cache/instance"
	"github.com/e2b-dev/infra/packages/shared/pkg/db"
	"github.com/e2b-dev/infra/packages/shared/pkg/grpc/orchestrator"
	"github.com/e2b-dev/infra/packages/shared/pkg/id"
	"github.com/e2b-dev/infra/packages/shared/pkg/telemetry"
)

// SnapshotInstance creates a snapshot of the sandbox in the form of an environment template build that can be used to spawn new sandboxes
// without stopping the running instance
func (o *Orchestrator) SnapshotInstance(
	ctx context.Context,
	tracer trace.Tracer,
	sbx *instance.InstanceInfo,
	teamID uuid.UUID,
) (*api.Template, error) {
	ctx, span := tracer.Start(ctx, "snapshot-sandbox")
	defer span.End()

	// Create snapshot config
	metadata := sbx.Metadata
	if metadata == nil {
		metadata = make(map[string]string)
	}
	metadata["source_sandbox_id"] = sbx.Instance.SandboxID

	snapshotConfig := &db.SnapshotInfo{
		BaseTemplateID:     sbx.Instance.TemplateID,
		SandboxID:          sbx.Instance.SandboxID,
		VCPU:               sbx.VCpu,
		RAMMB:              sbx.RamMB,
		TotalDiskSizeMB:    sbx.TotalDiskSizeMB,
		Metadata:           metadata,
		KernelVersion:      sbx.KernelVersion,
		FirecrackerVersion: sbx.FirecrackerVersion,
		EnvdVersion:        sbx.Instance.EnvdVersion,
	}

	// Create snapshot build in DB
	envBuild, err := o.dbClient.NewSnapshotBuild(
		ctx,
		snapshotConfig,
		teamID,
	)
	if err != nil {
		errMsg := fmt.Errorf("error creating snapshot build: %w", err)
		telemetry.ReportCriticalError(ctx, errMsg)
		return nil, errMsg
	}

	// Get the client for the node where the sandbox is running
	client, err := o.GetClient(sbx.Instance.ClientID)
	if err != nil {
		errMsg := fmt.Errorf("error getting client for node '%s': %w", sbx.Instance.ClientID, err)
		telemetry.ReportCriticalError(ctx, errMsg)
		return nil, errMsg
	}

	// Create snapshot in orchestrator without stopping the instance
	response, err := client.Sandbox.Snapshot(ctx, &orchestrator.SandboxSnapshotRequest{
		SandboxId: sbx.Instance.SandboxID,
	})
	if err != nil {
		errMsg := fmt.Errorf("error creating snapshot: %w", err)
		telemetry.ReportCriticalError(ctx, errMsg)
		return nil, errMsg
	}

	// If the response doesn't include a template alias, generate one
	templateAlias := response.TemplateAlias
	if templateAlias == "" {
		// Generate template alias in format {source_sandbox_id}_{build_id}
		templateAlias = fmt.Sprintf("%s_%s", sbx.Instance.SandboxID, envBuild.ID.String())
	}

	templateID := id.Generate()

	// Create the Template object
	template := &api.Template{
		TemplateID:    templateID,
		BuildID:       envBuild.ID.String(),
		CpuCount:      api.CPUCount(sbx.VCpu),
		MemoryMB:      api.MemoryMB(sbx.RamMB),
		Public:        false,
		Aliases:       &[]string{templateAlias},
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		LastSpawnedAt: time.Now(),
		SpawnCount:    0,
		BuildCount:    1,
		CreatedBy: &api.TeamUser{
			Id:    teamID,
			Email: "",
		},
	}

	return template, nil
}
