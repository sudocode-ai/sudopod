STARTUP_SCRIPT = """#!/bin/bash
sudo usermod -aG sudo {username}

# Generate SSL keys
mkdir -p /home/{username}/ssl
openssl genrsa -out /home/{username}/ssl/key.pem 2048
openssl req -new -x509 -key /home/{username}/ssl/key.pem -out /home/{username}/ssl/cert.pem -days 365 -subj "/CN={host}"

# Adjust file permissions
sudo chown -R {username}:{username} /home/{username}/ssl

# Startup jupyter server
sudo docker run -d -p 8888:{jupyter_port} --restart=always -u $(id -u {username}):$(id -g {username}) -v /home/{username}:/home/jovyan/ -v /home/{username}/ssl:/home/jovyan/ssl -e JUPYTER_TOKEN='{jupyter_access_token}' us-west1-docker.pkg.dev/pods-staging/docker-images/sudopod-jupyter:latest start-notebook.sh --NotebookApp.certfile=/home/jovyan/ssl/cert.pem --NotebookApp.keyfile=/home/jovyan/ssl/key.pem --NotebookApp.allow_origin='*' --NotebookApp.ip='0.0.0.0' --NotebookApp.port=8888"
"""
