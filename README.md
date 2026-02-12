# sudopod

CLI tool for provisioning and managing cloud development workspaces.

Supports **GitHub Codespaces**, **self-hosted Coder**, and **Sudocode Hub** as workspace providers. Optionally connects workspaces to a private Tailscale network (via Headscale) for SSH and VS Code Remote access.

## Install

```bash
npm install -g sudopod
```

Or run from source during development:

```bash
npx tsx src/cli.ts --help
```

## Quick Start

### 1. Configure a provider

```bash
# Coder (self-hosted)
sudopod coder config --url https://coder.example.com --token <token>

# Codespaces (uses gh CLI auth automatically)
# No config needed — just have `gh` authenticated

# Hub
sudopod hub config --url https://hub.example.com --token <token>
```

### 2. Create a workspace

```bash
# Basic workspace from current git repo
sudopod coder create

# Specify repo, branch, services
sudopod coder create --repo owner/repo --branch main --service sudocode:3002

# With Tailscale networking (requires headscale setup first)
sudopod coder create --repo owner/repo --tailscale --service sudocode:3002
```

### 3. Manage workspaces

```bash
sudopod coder list                  # List all workspaces
sudopod coder resume                # Resume most recent workspace
sudopod coder resume <id>           # Resume specific workspace
sudopod coder stop <id>             # Stop a workspace
sudopod coder delete <id>           # Delete a workspace
sudopod coder get <id>              # Get workspace details
```

## CLI Reference

```
sudopod [--json] <command>

Providers (each supports: create, resume, stop, delete, get, list):
  coder         Self-hosted Coder provider
  codespaces    GitHub Codespaces provider
  hub           Sudocode Hub provider

If no provider is specified, uses the default (set via `sudopod config --provider <name>`).

Config:
  config                              View or set global configuration
    --provider <name>                 Set default provider
  coder config --url <url> --token <token>
  hub config --url <url> --token <token>

Workspace Commands (available under each provider):
  create                              Create a new workspace
    --repo <owner/repo>               Repository (default: current git repo)
    --branch <branch>                 Git branch (default: current branch)
    --retention <days>                Retention days (default: 7)
    --machine <type>                  Machine type (default: default)
    --service <name[:port]>           Services to install (repeatable)
    --setup-script <script>           One-time setup script
    --idle-timeout <minutes>          Idle timeout in minutes
    --tailscale                       Connect workspace to Headscale tailnet
  resume [id]                         Resume a workspace (most recent if omitted)
  stop <id>                           Stop a running workspace
  delete <id>                         Delete a workspace
  get <id>                            Get workspace details
  list                                List workspaces
    --status <status>                 Filter by status
    --owner <owner>                   Filter by repository owner
    --repo <repo>                     Filter by repository name
    --limit <n>                       Maximum results

Tailscale:
  tailscale connect                   Join a tailnet
    --control-server <url>            Headscale URL (default: from config)
    --auth-key <key>                  Preauthkey (default: auto-generated)
    --api-key <key>                   Headscale admin API key
  tailscale create-key                Generate a preauthkey
    --no-ephemeral                    Non-ephemeral key
    --reusable                        Reusable key
    --expiration <duration>           Expiration (e.g. 1h, 30m, 2d)
    --user <name>                     Headscale user

Headscale:
  headscale start                     Start local Headscale via Docker
    --port <port>                     Headscale port (default: 8080)
  headscale stop                      Stop local Headscale instance
```

## Tailscale Networking

sudopod can connect workspaces to a private Tailscale network using a local Headscale control server. This enables direct SSH and VS Code Remote-SSH access without port forwarding.

```bash
# 1. Start local Headscale (Docker + ngrok tunnel)
sudopod headscale start

# 2. Connect your local machine to the tailnet
sudopod tailscale connect

# 3. Create a workspace on the tailnet
sudopod coder create --repo owner/repo --tailscale --service sudocode:3002

# 4. SSH directly via Tailscale IP
ssh root@100.64.0.2

# 5. Open in VS Code
code --remote ssh-remote+root@100.64.0.2 /workspaces/repo
```

## Development

```bash
npm install                           # Install dependencies
npm test                              # Run unit tests
npm run build                         # Compile TypeScript to dist/

# Run CLI from source (no build needed)
npx tsx src/cli.ts coder create --repo owner/repo --tailscale

# See TESTING.md for integration/E2E test details
```

## Architecture

- `src/cli.ts` -- CLI entry point (commander)
- `src/provider/` -- Provider implementations (codespaces, coder, hub)
- `src/provider/codespaces/setup.ts` -- Workspace setup utilities (install, tailscale, services)
- `src/services/` -- Service registry and workspace manifest
- `src/coder-sdk/` -- Coder API client
- `src/headscale/` -- Headscale API client
- `src/ngrok/` -- ngrok tunnel management
