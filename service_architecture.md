# E2B Infrastructure Architecture

## Overview
E2B is a service that provides remote runtime environments (sandboxes) for AI agents. This document outlines the architecture of the E2B infrastructure repository, which implements a self-hostable version of the E2B service on Google Cloud Platform.

## Core Components

### 1. Cluster Architecture
- **Server Cluster**: Runs Nomad and Consul servers for orchestration and service discovery.
- **Client Cluster**: Runs Nomad clients that host Firecracker VMs for sandboxes.
- **API Cluster**: Hosts the API service for managing sandboxes.
- **Build Cluster**: Used for building templates and environments.

### 2. Orchestration Layer
- **Nomad**: Schedules and runs jobs across the cluster. All services are deployed as Nomad jobs.
- **Consul**: Provides service discovery and configuration.

### 3. Sandbox Management
- **Orchestrator**: Runs as a Nomad system job on every client node. Manages the lifecycle of Firecracker VMs on that node.
- **Firecracker**: Lightweight virtualization technology used to create isolated sandboxes.
- **UFFD (Userfaultfd)**: Used for efficient memory management in Firecracker VMs.

### 4. Template Management
- **Template Manager**: Runs as a Nomad job. Manages VM templates for quick sandbox creation.
- **Template Storage**: GCS buckets store VM templates, kernels, and Firecracker versions.

### 5. API and Proxies
- **API Service**: Provides the REST API for creating and managing sandboxes.
- **Client Proxy**: Handles connections to the client VMs.
- **Session Proxy**: Manages user sessions.
- **Docker Reverse Proxy**: Handles Docker connections for building custom environments.

### 6. Storage
- **GCS Buckets**: Store VM templates, kernels, Firecracker versions, and other artifacts.
- **PostgreSQL Database**: Stores metadata about users, teams, and sandboxes.

### 7. Monitoring and Logging
- **Loki**: Log aggregation.
- **OpenTelemetry**: Distributed tracing.
- **Grafana**: Optional monitoring and visualization.

## Component Interactions

### Sandbox Creation Flow
1. User requests a sandbox via the API.
2. API service validates the request and forwards it to the orchestrator on a client node.
3. Orchestrator:
   - Allocates network resources for the sandbox.
   - Fetches the template from GCS.
   - Creates a Firecracker VM using the template.
   - Sets up UFFD for memory management.
   - Starts the VM.
4. API returns connection details to the user.

### Template Management Flow
1. User requests a template build via the API.
2. API service validates the request and forwards it to the template manager.
3. Template manager:
   - Creates a build job.
   - Builds the template.
   - Uploads the template to GCS.
   - Updates the template metadata in the database.

## Deployment Architecture

### Infrastructure Setup
- All infrastructure is defined as Terraform code.
- GCP resources include:
  - Compute Engine instances for clusters.
  - GCS buckets for storage.
  - Secret Manager for secrets.
  - IAM roles and service accounts.

### Service Deployment
- All services are deployed as Nomad jobs.
- Orchestrator runs as a system job on every client node.
- API, template manager, and proxies run as service jobs.

### Networking
- Load balancers expose services to the internet.
- Internal services communicate via Consul service discovery.
- Each sandbox gets its own isolated network.

## Key Files and Directories

- **packages/**: Contains the core components of the infrastructure.
  - **api/**: API service for managing sandboxes.
  - **orchestrator/**: Manages Firecracker VMs on client nodes.
  - **template-manager/**: Manages VM templates.
  - **client-proxy/**: Handles connections to client VMs.
  - **docker-reverse-proxy/**: Handles Docker connections.
  - **cluster/**: Infrastructure setup for the cluster.
  - **nomad/**: Job definitions for Nomad.
  - **shared/**: Common functionality used across packages.

- **terraform/**: Contains additional Terraform modules.
  - **grafana/**: Grafana setup for monitoring.

- **main.tf**: Main Terraform configuration file.
- **variables.tf**: Terraform variables.
- **Makefile**: Commands for building, deploying, and managing the infrastructure.

## Deployment Process

1. **Environment Setup**: Configure environment variables in `.env.{env}` file.
2. **Infrastructure Initialization**: Initialize Terraform and create required GCP resources.
3. **Build and Upload**: Build and upload Docker images and binaries.
4. **Database Migration**: Set up the database schema.
5. **Infrastructure Deployment**: Deploy the infrastructure using Terraform.
6. **Cluster Setup**: Set up the Nomad cluster and deploy jobs.

This architecture enables E2B to provide isolated, on-demand sandboxes for AI agents, with a focus on scalability, security, and performance. 