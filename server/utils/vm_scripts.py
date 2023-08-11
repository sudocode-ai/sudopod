
SETUP_PYTHON_SCRIPT = """
#!/bin/bash

# Update package list
sudo apt-get update -y

# Install prerequisites
sudo apt-get install -y build-essential checkinstall
sudo apt-get install -y libreadline-gplv2-dev libncursesw5-dev libssl-dev libsqlite3-dev tk-dev libgdbm-dev libc6-dev libbz2-dev libffi-dev zlib1g-dev

# Install zlib1g-dev for zlib module
sudo apt-get install -y zlib1g-dev

# Install libffi for _ctypes module
sudo apt-get install -y libffi-dev

# Download Python 3.11
cd /opt
sudo wget https://www.python.org/ftp/python/3.11.4/Python-3.11.4.tgz

# Extract the package
sudo tar xzf Python-3.11.4.tgz

# Go to the Python directory
cd Python-3.11.4

# Run the configure
sudo ./configure --enable-optimizations

# Install Python
sudo make altinstall

# Create a symbolic link to python3.11
sudo ln -s /usr/local/bin/python3.11 /usr/local/bin/python
"""
