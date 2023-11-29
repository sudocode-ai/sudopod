
#!/bin/bash
usermod -aG sudo {username}

# Generate SSL keys
mkdir -p /home/{username}/ssl
openssl genrsa -out /home/{username}/ssl/key.pem 2048
openssl req -new -x509 -key /home/{username}/ssl/key.pem -out /home/{username}/ssl/cert.pem -days 365 -subj "/CN=localhost"

# Adjust file permissions
chown -R {username}:{username} /home/{username}/ssl