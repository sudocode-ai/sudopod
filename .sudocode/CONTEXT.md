# E2B Proxy System Context

## Current Architecture

### Domain Structure
- E2B currently uses a domain structure of `<port>-<sandbox-id>.e2b.dev` for accessing sandboxes.
- The port number is included in the subdomain to route traffic to the correct service within the sandbox.

### Proxy Flow
1. **Client Request**: A request comes in to `<port>-<sandbox-id>.e2b.dev`.
2. **Load Balancer**: The request is routed through a Google Cloud load balancer.
3. **Client Proxy**: The request is handled by the client-proxy service, which:
   - Extracts the sandbox ID from the hostname.
   - Queries the DNS server (running on the API service) to find which node is hosting the sandbox.
   - Forwards the request to the session-proxy on the appropriate node.
4. **Session Proxy**: The session-proxy (an Nginx instance) on the node:
   - Extracts the port and sandbox ID from the hostname.
   - Routes the request to the correct port on the sandbox VM.

### Authentication
- Currently, there is no authentication at the proxy level.
- Authentication is handled at the API level when creating/managing sandboxes, but not when accessing them.

### Networking
- The URL map in the load balancer routes requests based on the hostname:
  - `api.<domain>` → API service
  - `docker.<domain>` → Docker reverse proxy
  - `nomad.<domain>` → Nomad UI
  - `consul.<domain>` → Consul UI
  - `*.<domain>` → Client proxy (for sandbox access)

## Key Components

### Client Proxy
- Implemented in Go.
- Runs as a Nomad job on the API cluster.
- Extracts the sandbox ID from the hostname and resolves it to a node IP using DNS.
- Forwards the request to the session proxy on the node.

### Session Proxy
- Implemented as an Nginx configuration.
- Runs as a Nomad system job on every client node.
- Extracts the port and sandbox ID from the hostname.
- Routes the request to the correct port on the sandbox VM.

### DNS Resolution
- The API service maintains a mapping of sandbox IDs to node IPs.
- The client proxy queries this DNS service to find which node is hosting a sandbox.

## Security Considerations

### Current Vulnerabilities
- No authentication at the proxy level means anyone with knowledge of a sandbox ID can access it.
- No rate limiting or IP-based restrictions at the sandbox level.
- No token-based access control for sandbox connections.

### Cloudflare Integration
- The system uses Cloudflare for DNS and certificate management.
- Cloudflare API tokens are stored in GCP Secret Manager.
