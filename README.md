![E2B Infra Preview Light](/readme-assets/infra-light.png#gh-light-mode-only)
![E2B Infra Preview Dark](/readme-assets/infra-dark.png#gh-dark-mode-only)

# E2B Infrastructure

This repository contains the infrastructure that powers the Sudopod platform.

## Accessing the Nomad UI

Access here: https://nomad.sudopod.info/

In order to retrieve the secret token, go here:
https://console.cloud.google.com/security/secret-manager/secret/sp-nomad-secret-id/versions?authuser=0&hl=en&project=sudopod-e2b

## Updating Infra Hints

Whenever updating infra, we should refer to the self hosting guide on how to set things up.

The plan is, we'll have two mirror versions of the infra running during migrations. We'll move all traffic over to the new version, and tear the old one down after some cool down period.

### Re-Deploying (when stuff is busted)

If nomad is not running, refer to the [self-hosting guide](./self-host.md) to tear down infra and start fresh. Note that if nomad is down, `make destroy` will fail. Instead run `terraform state rm module.nomad` to remove the nomad module from the state before running make destroy.

in short:
```
make login-gcloud
terraform state rm module.nomad # only needed if you've never run this before
make destroy
```

Now, for the self hosting steps, we don't need to follow all of them as the DB is already setup.
We should just need to run the following:
```
make switch-env ENV={prod,staging,dev} # No need to rerun if env is already switched
make login-gcloud
make init
make build-and-upload
make copy-public-builds # only needed if you've never run this before
make plan-without-jobs
make apply
make plan
make apply
```

Now, test your changes by running the following:
`E2B_DOMAIN=sudopod.info e2b sandbox spawn sudocode-gym --config .e2b/sudopod.toml`
`E2B_DOMAIN=sudopod2.info e2b sandbox spawn sudocode-gym --config .e2b/sudopod.toml`

## Testing

The project uses Go's built-in testing framework. Tests are located next to the source files with the naming pattern `*_test.go`.

To run tests:

```bash
# Run all tests from the root directory
go test ./... -v

# Run tests for a specific package
go test ./packages/api/internal/orchestrator/... -v

# Run a specific test
go test ./packages/api/internal/orchestrator/... -v -run TestGetLeastBusyNode

# To run tests without cache
go clean -testcache && go test ./... -v
```

Note: Tests must be run from the root directory where the `go.work` file is located to ensure proper module resolution.

## Attribution

Based on [E2B](https://e2b.dev), an open-source infrastructure for AI code interpreting. Check the main repository [e2b-dev/e2b](https://github.com/e2b-dev/E2B)


## Self-hosting

Read the [self-hosting guide](./self-host.md) to learn how to set up the infrastructure on your own. The infrastructure is deployed using Terraform.

Supported cloud providers:
- 🟢 GCP
- 🚧 AWS
- [ ] Azure
- [ ] General linux machine
