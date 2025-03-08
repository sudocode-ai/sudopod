# Implementation Plan: Secure Sandbox Access with Supabase Auth

## Overview

This plan outlines the steps to implement secure access to E2B sandboxes by:
1. Using a custom domain for sandbox access
2. Adding token-based authentication using Supabase Auth
3. Implementing a token generation and verification system for sandbox access

## Phase 1: Supabase Auth Integration

### 1.1 Set Up Supabase Auth Configuration
- Ensure Supabase Auth is properly configured in the self-hosted environment
- Create necessary database tables for token management

```sql
-- Create table for tracking sandbox access tokens
CREATE TABLE sandbox_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL,
    sandbox_id TEXT NOT NULL,
    token_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    
    UNIQUE(agent_id, sandbox_id, token_id)
);

-- Add Row Level Security policies
ALTER TABLE sandbox_tokens ENABLE ROW LEVEL SECURITY;

-- Only allow agents to see their own tokens
CREATE POLICY "Agents can view their own tokens" 
    ON sandbox_tokens FOR SELECT 
    USING (auth.uid()::text = agent_id);
```

### 1.2 Create Agent Service Account Management
- Implement functions to create and manage agent service accounts
- Set up appropriate roles and permissions for agents

```go
// Create a service role for an agent
func createAgentServiceAccount(agentID string) (string, error) {
    client := supabase.CreateClient(supabaseURL, supabaseKey)
    
    // Create a service account with the agent ID as the email
    resp, err := client.Auth.Admin.CreateUser(context.Background(), &auth.AdminUserAttributes{
        Email:    fmt.Sprintf("agent-%s@service.internal", agentID),
        Password: generateSecurePassword(), // Generate a secure random password
        AppMetadata: map[string]interface{}{
            "role": "agent",
            "agent_id": agentID,
        },
    })
    
    if err != nil {
        return "", err
    }
    
    // Generate an API key for this service account
    apiKey, err := generateAPIKeyForUser(resp.User.ID)
    if err != nil {
        return "", err
    }
    
    return apiKey, nil
}

// Generate a secure password for service accounts
func generateSecurePassword() string {
    bytes := make([]byte, 32)
    if _, err := rand.Read(bytes); err != nil {
        panic(err) // This should never happen
    }
    return base64.URLEncoding.EncodeToString(bytes)
}
```

## Phase 2: Token Generation and Management

### 2.1 Implement Token Generation During Sandbox Creation
- Modify the sandbox creation flow to generate access tokens using Supabase Auth
- Store token references in the database for tracking and potential revocation

```go
// In packages/api/internal/orchestrator/create_instance.go
func (o *Orchestrator) CreateSandbox(...) (*api.Sandbox, error) {
    // ... existing code ...
    
    // Generate access token for the sandbox
    accessToken, err := generateSandboxToken(agentID, sandboxID, timeout)
    if err != nil {
        return nil, fmt.Errorf("failed to generate access token: %w", err)
    }
    
    // ... existing code ...
    
    // Include token in response
    sbx := api.Sandbox{
        ClientID:    node.Info.ID,
        SandboxID:   sandboxID,
        TemplateID:  *build.EnvID,
        Alias:       &alias,
        EnvdVersion: *build.EnvdVersion,
        AccessToken: accessToken,
    }
    
    // ... rest of the function ...
}

// Generate a sandbox access token using Supabase Auth
func generateSandboxToken(agentID, sandboxID string, expiration time.Duration) (string, error) {
    client := supabase.CreateClient(supabaseURL, supabaseKey)
    
    // Create a JWT with custom claims
    token, err := client.Auth.Admin.GenerateLink(context.Background(), &auth.GenerateLinkOptions{
        Type:       "magiclink",
        Email:      fmt.Sprintf("agent-%s@service.internal", agentID),
        RedirectTo: "",
        Data: map[string]interface{}{
            "sandbox_id": sandboxID,
            "exp": time.Now().Add(expiration).Unix(),
        },
    })
    
    if err != nil {
        return "", err
    }
    
    // Store the token reference in the database for potential revocation
    _, err = client.DB.From("sandbox_tokens").Insert(map[string]interface{}{
        "agent_id": agentID,
        "sandbox_id": sandboxID,
        "token_id": token.Properties.TokenHash,
        "expires_at": time.Now().Add(expiration),
    }).Execute()
    
    return token.Properties.AccessToken, err
}
```

### 2.2 Create Token Verification Service
- Implement a service to verify tokens using Supabase Auth
- Add functionality to check if tokens have been revoked

```go
// In packages/api/internal/api/token_verification.go
func (a *APIStore) VerifySandboxToken(ctx context.Context, sandboxID, token string) (bool, error) {
    client := supabase.CreateClient(a.supabaseURL, a.supabaseKey)
    
    // Verify the JWT token
    claims, err := client.Auth.VerifyToken(token)
    if err != nil {
        return false, err
    }
    
    // Check if the token is for this sandbox
    sandboxClaim, ok := claims["sandbox_id"].(string)
    if !ok || sandboxClaim != sandboxID {
        return false, errors.New("token not valid for this sandbox")
    }
    
    // Check if the token has been revoked
    var result []struct{
        Revoked bool `json:"revoked"`
    }
    
    err = client.DB.From("sandbox_tokens").
        Select("revoked").
        Eq("token_id", claims["jti"]).
        Single().
        Execute(&result)
    
    if err != nil || len(result) == 0 {
        return false, errors.New("token not found")
    }
    
    return !result[0].Revoked, nil
}
```

### 2.3 Add Token Extension Endpoint
- Create an API endpoint to extend token validity for long-running sandboxes
- Implement token revocation and regeneration

```go
// In packages/api/internal/handlers/sandbox_token.go
func (a *APIStore) ExtendSandboxToken(c *gin.Context) {
    // Extract sandbox ID and current token from request
    sandboxID := c.Param("sandboxID")
    currentToken := c.GetHeader("Authorization")
    currentToken = strings.TrimPrefix(currentToken, "Bearer ")
    
    // Get agent ID from authenticated user
    agentID := c.GetString("agent_id")
    
    // Parse extension duration from request
    var req struct {
        ExtensionHours int `json:"extension_hours"`
    }
    if err := c.BindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
        return
    }
    
    extension := time.Duration(req.ExtensionHours) * time.Hour
    
    // Extend the token
    newToken, err := a.extendSandboxToken(agentID, sandboxID, currentToken, extension)
    if err != nil {
        c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{"access_token": newToken})
}

func (a *APIStore) extendSandboxToken(agentID, sandboxID, currentToken string, extension time.Duration) (string, error) {
    // Verify the current token is valid
    valid, err := a.VerifySandboxToken(context.Background(), sandboxID, currentToken)
    if err != nil || !valid {
        return "", errors.New("invalid token")
    }
    
    // Revoke the current token
    client := supabase.CreateClient(a.supabaseURL, a.supabaseKey)
    _, err = client.DB.From("sandbox_tokens").
        Update(map[string]interface{}{"revoked": true}).
        Match(map[string]interface{}{
            "agent_id": agentID,
            "sandbox_id": sandboxID,
            "revoked": false,
        }).
        Execute()
    
    if err != nil {
        return "", err
    }
    
    // Generate a new token with extended expiration
    return generateSandboxToken(agentID, sandboxID, extension)
}
```

## Phase 3: Proxy Authentication

### 3.1 Modify Client Proxy for Token Verification
- Update the client-proxy to extract and verify tokens from requests
- Implement token verification using the API service

```go
// In packages/client-proxy/main.go
func proxyHandler(logger *zap.SugaredLogger) func(w http.ResponseWriter, r *http.Request) {
    return func(w http.ResponseWriter, r *http.Request) {
        // Extract sandbox ID from hostname
        hostSplit := strings.Split(r.Host, "-")
        if len(hostSplit) < 2 {
            logger.Warn("invalid host", zap.String("host", r.Host))
            http.Error(w, "Invalid host", http.StatusBadRequest)
            return
        }
        
        sandboxID := hostSplit[1]
        
        // Extract token from request
        token := extractToken(r)
        if token == "" {
            logger.Warn("missing authentication token", zap.String("sandbox_id", sandboxID))
            http.Error(w, "Authentication required", http.StatusUnauthorized)
            return
        }
        
        // Verify token with API service
        valid, err := verifyTokenWithAPI(r.Context(), sandboxID, token)
        if err != nil {
            logger.Error("token verification error", zap.Error(err), zap.String("sandbox_id", sandboxID))
            http.Error(w, "Authentication error", http.StatusInternalServerError)
            return
        }
        
        if !valid {
            logger.Warn("invalid token", zap.String("sandbox_id", sandboxID))
            http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
            return
        }
        
        // Continue with existing proxy logic...
        // [existing DNS resolution and proxy code]
    }
}

// Extract token from various sources in the request
func extractToken(r *http.Request) string {
    // Check Authorization header first (preferred method)
    authHeader := r.Header.Get("Authorization")
    if strings.HasPrefix(authHeader, "Bearer ") {
        return strings.TrimPrefix(authHeader, "Bearer ")
    }
    
    // Check query parameter
    token := r.URL.Query().Get("token")
    if token != "" {
        return token
    }
    
    // Check cookie
    cookie, err := r.Cookie("access_token")
    if err == nil {
        return cookie.Value
    }
    
    return ""
}

// Verify token with the API service
func verifyTokenWithAPI(ctx context.Context, sandboxID, token string) (bool, error) {
    // Create gRPC connection to API service
    conn, err := grpc.DialContext(ctx, "api.service.consul:50001", grpc.WithInsecure())
    if err != nil {
        return false, err
    }
    defer conn.Close()
    
    // Create client and call verification method
    client := pb.NewTokenVerificationClient(conn)
    resp, err := client.VerifyToken(ctx, &pb.VerifyTokenRequest{
        SandboxId: sandboxID,
        Token:     token,
    })
    
    if err != nil {
        return false, err
    }
    
    return resp.Valid, nil
}
```

### 3.2 Add gRPC Service for Token Verification
- Create a gRPC service in the API for token verification
- Define the protocol buffer for the verification service

```protobuf
// In packages/api/proto/token_verification.proto
syntax = "proto3";

package api;

service TokenVerification {
  rpc VerifyToken(VerifyTokenRequest) returns (VerifyTokenResponse);
}

message VerifyTokenRequest {
  string sandbox_id = 1;
  string token = 2;
}

message VerifyTokenResponse {
  bool valid = 1;
  string error = 2;
}
```

```go
// In packages/api/internal/grpc/token_verification.go
type TokenVerificationServer struct {
    apiStore *api.APIStore
    pb.UnimplementedTokenVerificationServer
}

func (s *TokenVerificationServer) VerifyToken(ctx context.Context, req *pb.VerifyTokenRequest) (*pb.VerifyTokenResponse, error) {
    valid, err := s.apiStore.VerifySandboxToken(ctx, req.SandboxId, req.Token)
    if err != nil {
        return &pb.VerifyTokenResponse{
            Valid: false,
            Error: err.Error(),
        }, nil
    }
    
    return &pb.VerifyTokenResponse{
        Valid: valid,
    }, nil
}
```

## Phase 4: Custom Domain and SDK Updates

### 4.1 Update DNS Configuration
- Modify the Terraform configuration to use the custom domain
- Update the Cloudflare DNS records to point to the GCP load balancer

```terraform
# In packages/cluster/network/main.tf
resource "cloudflare_record" "a_star" {
  zone_id = data.cloudflare_zone.domain.id
  name    = "*"
  value   = google_compute_global_address.orch_ip.address
  type    = "A"
  proxied = true
}
```

### 4.2 Update URL Mapping
- Modify the URL map in the load balancer to route requests based on the new domain
- Ensure that the wildcard subdomain pattern works with the new domain

```terraform
# In packages/cluster/network/main.tf
resource "google_compute_url_map" "orch_map" {
  # ...
  
  host_rule {
    hosts        = concat(["*.${var.domain_name}"], [for d in var.additional_domains : "*.${d}"])
    path_matcher = "session-paths"
  }
  
  # ...
}
```

### 4.3 Update SDK for Token Authentication
- Modify the E2B SDK to include the access token in requests
- Update the connection logic to use the new domain format
- Implement secure token handling in the SDK

```typescript
// JavaScript/TypeScript SDK
class Sandbox {
  constructor(options) {
    this.domain = options.domain || "e2b.sudocode.ai";
    this.accessToken = options.accessToken;
    this.agentId = options.agentId;
    this.sandboxId = null;
  }
  
  async create(templateId) {
    // Create sandbox via API
    const response = await fetch(`https://api.${this.domain}/v1/sandboxes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        template_id: templateId,
        agent_id: this.agentId
      })
    });
    
    const data = await response.json();
    this.sandboxId = data.sandbox_id;
    this.accessToken = data.access_token;
    
    return data;
  }
  
  connect(port) {
    if (!this.sandboxId || !this.accessToken) {
      throw new Error('Sandbox not created or missing access token');
    }
    
    // Create WebSocket connection with token in header
    // Note: Using headers instead of query params for better security
    const socket = new WebSocket(`wss://${port}-${this.sandboxId}.${this.domain}`);
    
    // Send authentication message immediately after connection
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'authentication',
        token: this.accessToken
      }));
    };
    
    return socket;
  }
  
  // Method to extend sandbox lifetime
  async extendLifetime(hours) {
    if (!this.sandboxId || !this.accessToken) {
      throw new Error('Sandbox not created or missing access token');
    }
    
    const response = await fetch(`https://api.${this.domain}/v1/sandboxes/${this.sandboxId}/extend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: JSON.stringify({
        extension_hours: hours
      })
    });
    
    const data = await response.json();
    // Update token with the new one
    this.accessToken = data.access_token;
    
    return data;
  }
}
```

### 4.4 Update WebSocket Protocol for Authentication
- Modify the session proxy to handle WebSocket authentication
- Update the Nginx configuration to pass authentication headers

```nginx
# In packages/nomad/proxies/session.conf
# Add support for WebSocket authentication
map $http_sec_websocket_protocol $ws_protocol {
    default $http_sec_websocket_protocol;
    "~(^|,)\s*token\.(?<token>[^,\s]+)" $token;
}

# In the location block
location / {
    # ... existing configuration ...
    
    # Pass the token if available
    proxy_set_header Sec-WebSocket-Protocol $ws_protocol;
}
```

## Implementation Timeline

1. **Phase 1 (Supabase Auth Integration)**: 3-4 days
   - Set up Supabase Auth configuration
   - Create database schema for token management
   - Implement agent service account management

2. **Phase 2 (Token Generation and Management)**: 3-4 days
   - Implement token generation during sandbox creation
   - Create token verification service
   - Add token extension endpoint
   - Test token lifecycle management

3. **Phase 3 (Proxy Authentication)**: 3-4 days
   - Modify client proxy for token verification
   - Implement token extraction from various sources
   - Add gRPC service for token verification
   - Test authentication flow

4. **Phase 4 (Custom Domain and SDK Updates)**: 2-3 days
   - Update DNS configuration
   - Modify URL mapping
   - Update SDK for token authentication
   - Update WebSocket protocol for authentication

**Total Estimated Time**: 11-15 days

## Testing Plan

1. **Unit Tests**:
   - Test token generation and validation with Supabase Auth
   - Test token extraction from different sources (header, query, cookie)
   - Test token extension and revocation

2. **Integration Tests**:
   - Test sandbox creation with token generation
   - Test proxy authentication with valid and invalid tokens
   - Test WebSocket connections with token authentication
   - Test token extension for long-running sandboxes

3. **End-to-End Tests**:
   - Create sandbox, get token, and connect using the token
   - Verify that connections without a token are rejected
   - Verify that connections with an invalid token are rejected
   - Test token extension and continued access

## Rollout Strategy

1. **Development Environment**:
   - Implement and test all changes in the development environment
   - Verify that all components work together correctly
   - Test with sample agent and sandbox workflows

2. **Staging Environment**:
   - Deploy to staging and perform full integration testing
   - Test with real SDK clients
   - Validate token lifecycle management

3. **Production Rollout**:
   - Deploy Supabase Auth integration and token generation (without enforcement)
   - Update SDK to include token support (backward compatible)
   - Enable token verification with a grace period for existing connections
   - Complete transition to required token authentication

4. **Monitoring and Maintenance**:
   - Monitor token usage and authentication patterns
   - Set up alerts for unusual authentication failures
   - Implement regular token auditing
