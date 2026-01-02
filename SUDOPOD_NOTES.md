### Overview

Sudocode is an AI agent orchestration platform. The core `sudocode` package runs agent clusters that communicate with each other over a secure Nebula mesh network. The platform uses Coder as the underlying infrastructure orchestration layer to provision and manage isolated compute environments where these agent clusters run.


starting up VMs on behalf of customers (starttime is 60-120sec cold, 30sec warm)

We support an API that wraps around a coder instance
we self host a plain coder instance, and we use a CLI (from a protected machine) that lets us add templates. these tempaltes add static and parametrized variables, for setting up various machines. With this, our server can call the coder API and setup machines based on the pre-configured templates we support.

The paramaters to our API can call into the parameters for the templates. we can do things like specify one-off setup scripts, setup secrets files (configurable by path and contents), and run any other setup

snapshotting support requires some management on our end. We need some access to the GCP instance that's being run on (in order to create the snapshot, and get the ID). once this snapshot ID is created, we can create an instance using the snapshot ID (we need to track the template ID as well, to ensure the new instance is being run on a compatible template). This will create a snapshot of the machine.

The coder server then tracks the state of our various instances for us. These instances are defined by TF, so we can provision WHATEVER machines we want!

the provisioner can live inside wherever (so it can live inside of the client's own cloud), so that it can startup resources. our coder server will only have visibility into the created workspaces, as well as actions via the provisioner (like stopping an instance).

the coder server is able to provision and deprovision using the provisioner, so it doens't need direct access to the user's cloud account! the user configures the provisioner (we give them the setup for this), but ultimately they can choose what permissions we have (so we should only be able to provision and deprovision TF).

then, the coder agent runs inside of the workspace that gets provisioned. we can configure exactly what runs inside, and so we can configure it to be in "monitor only" mode. this mode only publishes statistics to us, so we can check the health of the coder instance. it also is in charge of startup scripts, so this is where we can setup sudocode, nebula, etc.

### IDE Plugins
works with jetbrains and vscode! (nice for toast). toast employees will be able to connect their intellij to any coder instance.


setting up secrets with coder:

```
// Customer using .env
await coder.createWorkspace({
  rich_parameter_values: [
    { name: "secrets_format", value: "env" },
    { name: "secrets_filename", value: ".env" },
    { name: "secrets_content", value: "DATABASE_URL=postgres://...\nAPI_KEY=sk-..." },
  ]
});

// Customer using YAML
await coder.createWorkspace({
  rich_parameter_values: [
    { name: "secrets_format", value: "yaml" },
    { name: "secrets_filename", value: "config/secrets.yaml" },
    { name: "secrets_content", value: "database:\n  url: postgres://...\napi_key: sk-..." },
  ]
});
```

invoking a setup script:
```
data "coder_parameter" "custom_setup_command" {
  name        = "custom_setup_command"
  type        = "string"
  default     = ""
  description = "Custom setup command (e.g., './scripts/setup.sh' or 'make dev-setup')"
}
```

we can also configure with devcontainers, so that we start the coder instance from within the devcontainer (so that the customer gets full control of their dev environment.)
### Key Components

**Sudocode Backend** (runs on your infrastructure)

- User-facing API for authentication, billing, and provisioning requests
- Does NOT run agent code—purely a control/management layer
- Communicates with Coder Server to orchestrate workspace lifecycle

**Coder Server** (runs on your infrastructure)

- Open source workspace orchestration platform (GNU AGPL v3)
- Provides REST API for workspace management
- Hosts the web dashboard (optional for your use case)
- Coordinates provisioners and tracks workspace state
- Proxies connections to workspaces via Coder Agents

in coder we configure/deploy our own templates

**Provisioner** (runs in customer VPC for Strict tier)

- Receives provisioning jobs from Coder Server
- Executes Terraform to create/destroy cloud resources
- Has credentials to customer's cloud account (AWS/GCP/Azure)
- Does NOT host workspaces—just runs Terraform
- Once a workspace VM is created, the provisioner's job is done

**Workspaces** (run in customer VPC—completely separate VMs)

- Fresh VMs provisioned by Terraform in customer's cloud
- Each workspace is hardware-isolated (VM-level isolation)
- Contains:
    - **sudocode package**: The actual agent orchestration engine
    - **Nebula client**: Connects to mesh network for inter-agent communication
    - **Coder Agent**: Small daemon that phones home to Coder Server for lifecycle management
    - **code-server**: VS Code in the browser for IDE access
    - **User's cloned repository and devcontainer environment**

**Nebula Lighthouse** (runs in customer VPC for Strict tier)

- Peer discovery service for the Nebula mesh network
- Only handles discovery—actual traffic flows P2P between workspaces
- All traffic encrypted end-to-end with certificate-based mutual authentication

### Architecture Diagram (Strict Security Tier)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  SUDOCODE INFRASTRUCTURE (managed by you)                                       │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                           │ │
│  │  ┌─────────────────────┐         ┌─────────────────────┐                 │ │
│  │  │  Sudocode Backend   │         │  Coder Server       │                 │ │
│  │  │                     │         │                     │                 │ │
│  │  │  • Auth / Billing   │────────►│  • REST API         │                 │ │
│  │  │  • User management  │         │  • Workspace state  │                 │ │
│  │  │  • Provisioning API │         │  • Template registry│                 │ │
│  │  │                     │         │  • Audit logging    │                 │ │
│  │  └─────────────────────┘         └──────────┬──────────┘                 │ │
│  │                                             │                             │ │
│  │         Generates Nebula certs              │  Sends provisioning jobs    │ │
│  │         for new workspaces                  │                             │ │
│  │                                             │                             │ │
│  └─────────────────────────────────────────────┼─────────────────────────────┘ │
│                                                │                               │
│ ═══════════════════════════════════════════════╪═══════════════════════════════│
│                           Network boundary     │                               │
│                      (HTTPS API calls only)    │                               │
│ ═══════════════════════════════════════════════╪═══════════════════════════════│
│                                                │                               │
│  CUSTOMER VPC (enterprise controls this)       │                               │
│                                                ▼                               │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                           │ │
│  │  ┌─────────────────────┐         ┌─────────────────────┐                 │ │
│  │  │  Provisioner        │         │  Nebula Lighthouse  │                 │ │
│  │  │  (licensed)         │         │                     │                 │ │
│  │  │                     │         │  • Peer discovery   │                 │ │
│  │  │  • Runs Terraform   │         │  • UDP 4242         │                 │ │
│  │  │  • Has cloud creds  │         │  • Customer-owned   │                 │ │
│  │  │  • Creates VMs      │         │                     │                 │ │
│  │  └──────────┬──────────┘         └──────────▲──────────┘                 │ │
│  │             │                               │                             │ │
│  │             │ terraform apply               │ Nebula mesh                 │ │
│  │             │ (creates VMs)                 │ (encrypted P2P)             │ │
│  │             ▼                               │                             │ │
│  │  ┌──────────────────────────────────────────┴────────────────────────┐   │ │
│  │  │                                                                   │   │ │
│  │  │  WORKSPACES (completely separate VMs per user/project)           │   │ │
│  │  │                                                                   │   │ │
│  │  │  ┌─────────────────────┐       ┌─────────────────────┐           │   │ │
│  │  │  │  Workspace A        │       │  Workspace B        │           │   │ │
│  │  │  │  (VM - User 1)      │       │  (VM - User 2)      │           │   │ │
│  │  │  │                     │       │                     │           │   │ │
│  │  │  │ ┌─────────────────┐ │       │ ┌─────────────────┐ │           │   │ │
│  │  │  │ │ sudocode        │ │       │ │ sudocode        │ │           │   │ │
│  │  │  │ │ (AGENT ENGINE)  │◄┼───────┼►│ (AGENT ENGINE)  │ │           │   │ │
│  │  │  │ │                 │ │ Nebula│ │                 │ │           │   │ │
│  │  │  │ │ Runs AI agents  │ │  mesh │ │ Runs AI agents  │ │           │   │ │
│  │  │  │ │ Orchestrates    │ │       │ │ Orchestrates    │ │           │   │ │
│  │  │  │ │ tasks           │ │       │ │ tasks           │ │           │   │ │
│  │  │  │ └─────────────────┘ │       │ └─────────────────┘ │           │   │ │
│  │  │  │                     │       │                     │           │   │ │
│  │  │  │ ┌───────┐ ┌───────┐ │       │ ┌───────┐ ┌───────┐ │           │   │ │
│  │  │  │ │Nebula │ │Coder  │ │       │ │Nebula │ │Coder  │ │           │   │ │
│  │  │  │ │client │ │Agent  │ │       │ │client │ │Agent  │ │           │   │ │
│  │  │  │ └───────┘ └───────┘ │       │ └───────┘ └───────┘ │           │   │ │
│  │  │  │                     │       │                     │           │   │ │
│  │  │  │ ┌───────┐ ┌───────┐ │       │ ┌───────┐ ┌───────┐ │           │   │ │
│  │  │  │ │code-  │ │User's │ │       │ │code-  │ │User's │ │           │   │ │
│  │  │  │ │server │ │repo + │ │       │ │server │ │repo + │ │           │   │ │
│  │  │  │ │(IDE)  │ │devcon.│ │       │ │(IDE)  │ │devcon.│ │           │   │ │
│  │  │  │ └───────┘ └───────┘ │       │ └───────┘ └───────┘ │           │   │ │
│  │  │  │                     │       │                     │           │   │ │
│  │  │  │ Nebula IP:          │       │ Nebula IP:          │           │   │ │
│  │  │  │ 10.100.0.5          │       │ 10.100.0.6          │           │   │ │
│  │  │  └─────────────────────┘       └─────────────────────┘           │   │ │
│  │  │                                                                   │   │ │
│  │  └───────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                           │ │
│  │  ┌─────────────────────┐                                                 │ │
│  │  │  Internal GitHub    │  ← Workspaces clone from here                   │ │
│  │  │  (never leaves VPC) │                                                 │ │
│  │  └─────────────────────┘                                                 │ │
│  │                                                                           │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Architecture Questions Answered

**Q: Is the Coder server running on the workspace VM itself?**

No. The Coder server is a control plane that runs on YOUR infrastructure, completely separate from workspaces. It's analogous to the Kubernetes control plane or AWS Console—a management layer that orchestrates resources but doesn't host user workloads.

**Q: When I create a "workspace", is that a completely separate machine?**

Yes. A workspace is a completely separate VM (or container, depending on template) created by Terraform in the customer's cloud account. The Terraform template defines the machine spec, and the provisioner executes that Terraform. The workspace VM is owned by the customer and runs in their VPC.

**Q: Is "escape" possible?**

No, not in any meaningful sense when using VM-based templates. Workspaces are hardware-isolated VMs. There's nothing to "escape" to—the provisioner and Coder server are entirely separate machines (and in Strict tier, in entirely separate networks). A user in Workspace A cannot access Workspace B, the provisioner, or the Coder server. The only communication paths are:

- Coder Agent → Coder Server (for lifecycle/connectivity)
- Nebula client → Nebula Lighthouse (for peer discovery)
- Workspace ↔ Workspace (via Nebula mesh, if allowed by firewall rules)

**Q: What is the provisioner's role?**

The provisioner is a worker that executes Terraform. It:

1. Receives a job from Coder Server: "Create workspace X with parameters Y"
2. Runs `terraform apply` with those parameters
3. Terraform calls cloud APIs (AWS/GCP/Azure) to create the VM
4. Reports back to Coder Server: "Done, here's the workspace info"

The provisioner does NOT host workspaces. Once the VM exists, the provisioner's job is complete. For Strict tier, the provisioner runs inside the customer's VPC so it has access to their cloud credentials and internal networks.

**Q: What is the Coder Agent?**

A small binary that runs inside each workspace. It:

- Establishes a reverse tunnel back to Coder Server (WireGuard or WebSocket)
- Enables SSH/terminal access without exposing ports publicly
- Reports workspace health and custom metadata
- Runs startup scripts defined in the template

The agent is NOT the control plane—it's a lightweight daemon that makes the workspace reachable and manageable.

**Q: What about the Nebula lighthouse—should it be in the customer's VPC?**

For Strict tier, yes. The lighthouse handles peer discovery (which workspace IPs can talk to which). By placing it in the customer's VPC:

- Network topology stays internal
- No dependency on external services
- Customer has full control

Note: The lighthouse only handles discovery. Actual traffic flows directly between workspaces (P2P) and is encrypted end-to-end using certificate-based mutual authentication.

### Data Flow: Creating a New Environment

```
1. User authenticates with Sudocode Backend
                    │
                    ▼
2. User requests: "Create environment for repo X with 4 CPU, 8GB RAM"
                    │
                    ▼
3. Sudocode Backend:
   • Validates user, checks quotas
   • Generates Nebula certificate for new workspace
   • Calls Coder Server API with parameters
                    │
                    ▼
4. Coder Server:
   • Validates request
   • Selects provisioner (the one in customer VPC)
   • Sends job: "Create workspace with template T, parameters P"
                    │
                    ▼
5. Provisioner (in customer VPC):
   • Receives job
   • Runs: terraform apply -var="cpu=4" -var="memory=8" ...
   • Terraform creates EC2/GCE/Azure VM
                    │
                    ▼
6. New VM boots in customer VPC:
   • Coder Agent starts, connects back to Coder Server
   • Nebula client starts, joins mesh network
   • sudocode package starts, ready for agent tasks
   • code-server starts, IDE available
   • User's repo cloned, devcontainer built
                    │
                    ▼
7. Coder Server notifies Sudocode Backend: "Workspace ready"
                    │
                    ▼
8. User receives:
   • Nebula IP (for agent communication)
   • IDE URL (proxied through Coder or direct)
   • Workspace status
```

### Security Boundaries (Strict Tier)

|Component|Location|What it can access|
|---|---|---|
|Sudocode Backend|Your infra|User data, billing, Coder API|
|Coder Server|Your infra|Workspace metadata, provisioner coordination|
|Provisioner|Customer VPC|Customer cloud APIs, can create VMs|
|Lighthouse|Customer VPC|Nebula peer discovery only|
|Workspaces|Customer VPC|Each other (via Nebula), internal GitHub, customer resources|
|Customer source code|Customer VPC|Never leaves their network|

### What Gets Licensed (Strict Tier)

|Component|License Type|Notes|
|---|---|---|
|sudocode package|Open source|Core agent engine, Apache 2.0 or MIT|
|Coder Server|Open source|GNU AGPL v3, you run it|
|Provisioner wrapper|Commercial|Your proprietary additions, licensed per deployment|
|Enterprise features|Commercial|SSO, audit logs, advanced RBAC, multi-tenancy|
|Nebula|Open source|MIT license|
|code-server|Open source|MIT license|

Customer receives a license key that:

- Validates their entitlement to run the enterprise features
- Enforces seat limits (max concurrent workspaces)
- Has an expiration date (annual renewal)
- Can phone home for validation (Strict) or work offline (Air-gapped)