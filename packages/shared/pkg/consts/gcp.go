package consts

import (
	"encoding/base64"
	"fmt"
	"os"
)

var (
	GCPProject                 = os.Getenv("GCP_PROJECT_ID")
	GCPZone                    = os.Getenv("GCP_ZONE")
	GCPInstanceGroup           = os.Getenv("GCP_INSTANCE_GROUP")
	Domain                     = os.Getenv("DOMAIN_NAME")
	DockerRegistry             = os.Getenv("GCP_DOCKER_REPOSITORY_NAME")
	GoogleServiceAccountSecret = os.Getenv("GOOGLE_SERVICE_ACCOUNT_BASE64")
	GCPRegion                  = os.Getenv("GCP_REGION")
)

var EncodedDockerCredentials = base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("_json_key_base64:%s", GoogleServiceAccountSecret)))
