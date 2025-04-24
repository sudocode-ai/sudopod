# Pulling upstream changes

When pulling upstream changes, we'll need to first update our e2b branch:

## Update e2b-main with latest changes
git checkout e2b-main
git pull upstream main

## Rebase your changes on top
git checkout main
git rebase e2b-main

# Self hosting guide addendums

Make sure your gcloud project is set properly
`gcloud config set project sudopod-dev`
`gcloud config set project sudopod-e2b-5`

# Making updates

## Publishing local changes

make sure you checkout the correct env.

Then, once you've run `make build-and-upload`, you can run
`make plan-only-jobs` and `make apply` to publish those changes to nomad.

## When protobuf changes are made

make sure to run these commands to regenerate the protobuf files, make sure to cd into the package itself. here are the different examples:

orchestrator:
```
cd packages/orchestrator
make init
PATH=$PATH:~/go/bin make generate
cd -
```

This one doens't work well for me, something isn't right about the versions.
envd:
```
cd packages/envd
make init-generate
PATH=$PATH:~/go/bin make generate
cd -
```

template-manager:
```
cd packages/template-manager
make init
PATH=$PATH:~/go/bin make generate
cd -
```

api:
```
cd packages/api
PATH=$PATH:~/go/bin make generate
cd -
```


