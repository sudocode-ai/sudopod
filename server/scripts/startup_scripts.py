STARTUP_SCRIPT = """#!/bin/bash
usermod -aG sudo {username} 
sudo docker pull us-west1-docker.pkg.dev/pods-staging/docker-images/sudopod-jupyter:latest
sudo docker run -d -p {jupyter_port}:8888 --restart=always -u $(id -u {username}):$(id -g {username}) -v /home/{username}:/home/jovyan/ -e JUPYTER_TOKEN='{jupyter_access_token}' us-west1-docker.pkg.dev/pods-staging/docker-images/sudopod-jupyter:latest

# Create Project kernel
sleep 30  # Simple delay; consider a more robust check
JUPYTER_URL='http://localhost:{jupyter_port}/api/kernels'
PAYLOAD='{{"name": "python3"}}'
curl -X POST $JUPYTER_URL \
    -H "Authorization: token {jupyter_access_token}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"
echo "Project Kernel created via Jupyter API."

#Note. For each supported language, we should include a kernelspec that we create here.
# Create Session kernelspecs
sudo docker exec $(docker ps -q --filter ancestor=us-west1-docker.pkg.dev/pods-staging/docker-images/sudopod-jupyter:latest) bash -c "python3 -m venv --system-site-packages /home/jovyan/.{default_python_session}"
sudo docker exec $(docker ps -q --filter ancestor=us-west1-docker.pkg.dev/pods-staging/docker-images/sudopod-jupyter:latest) bash -c "source /home/jovyan/.{default_python_session}/bin/activate && python3 -m ipykernel install --user --name={default_python_session}"

# Create Session kernel
PAYLOAD='{{"name": "{default_python_session}"}}'
curl -X POST $JUPYTER_URL \
    -H "Authorization: token {jupyter_access_token}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"
echo "Project Kernel created via Jupyter API."

"""
