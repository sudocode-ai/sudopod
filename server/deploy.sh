
#!/bin/bash

trap cleanup SIGINT

cleanup() {
  echo "Caught SIGINT, cleaning up before exit"
  # Reset terminal
  reset
  exit 1
}

PROD_ARG=false
NOCACHE_ARG=false

for arg in "$@"
do
  case $arg in
    prod)
      PROD_ARG=true
      ;;
    --no-cache)
      NOCACHE_ARG=true
      ;;
  esac
done


# Set your variables
IMAGE_NAME="sudopod-backend"
REPO_NAME="sudopod"
REGION="us-west1"
SERVICE_NAME="sudopod-backend-staging"

# Build the Docker image with a unique timestamp-based tag
IMAGE_TAG=$(date +%Y%m%d-%H%M%S)

# Check the environment argument
if [ "$PROD_ARG" = true ]; then
  SERVICE_NAME="sudopod-backend"
  PROJECT_ID="sudocode-389022"
  DOCKERFILE="Dockerfile"
else
  SERVICE_NAME="sudopod-backend-staging"
  PROJECT_ID="sudocode-staging"
  DOCKERFILE="Dockerfile.staging"
fi

gcloud config set project ${PROJECT_ID}
echo "\n========================="
echo "Deploying: $SERVICE_NAME"
echo "=========================\n"


# Check the no-cache argument
if [ "$NOCACHE_ARG" = true ]; then
  NO_CACHE="--no-cache"
else
  NO_CACHE=""
fi

docker build ${NO_CACHE} -f ${DOCKERFILE} -t ${IMAGE_NAME}:${IMAGE_TAG} .

# Tag and push the Docker image to Artifact Registry
ARTIFACT_REGISTRY_PATH=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:${IMAGE_TAG}
docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${ARTIFACT_REGISTRY_PATH}
docker push ${ARTIFACT_REGISTRY_PATH}

# Deploy the updated Docker image to Cloud Run
gcloud run deploy ${SERVICE_NAME} --image ${ARTIFACT_REGISTRY_PATH} --platform managed --region ${REGION} --no-allow-unauthenticated
