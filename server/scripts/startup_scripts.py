STARTUP_SCRIPT = """#!/bin/bash
usermod -aG sudo {username} 
sudo docker run -d -p {jupyter_port}:8888 --restart=always -u $(id -u {username}):$(id -g {username}) -v /home/{username}:/home/jovyan/ -e JUPYTER_TOKEN='{jupyter_access_token}' us-west1-docker.pkg.dev/pods-staging/docker-images/sudopod-jupyter:latest"""
