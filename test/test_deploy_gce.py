import requests
import paramiko
import time
import logging
# logging.basicConfig(level=logging.DEBUG)

# Define the URL of the endpoint
url = 'http://0.0.0.0:8520/session'

# Define the payload
payload = {
    'session_id': '555555',
    'public_key': "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCwpo6zjTchKy6T6T5BWJroglhFhnviN4hhyoaCpqUMq5rx3MUnV8RsbR0Sf+Aos1IQ8BIZ1hRSzU1vnexlixfUDxg40RXijk7R8COX9CNVxUCToaptYJDGauZxcQuyecd74vKdtPT4+c7Y1rKQD21ihIGBUOWPqtJR2NVthPwe+6NwB0xzp4iXATU6Z+OcedDHT3HO6M/bqVgiT7zlYS3s8uxHXe7L2bU/oC4owrXKED71ZW83nvvsQT1xgiab2q5uIhmtQcbXh+0Uix1duOzqGLQyF/2nMO2bBw0fxV/mROVa8YkHHd7X15EtZiuo5ubM7jSOAPB0BMC3IotvfMBJfpAIvJRNgRiaxlEvJSM7l8+JRGGpu0udXpJv9jYbXCJQ7W3JGAvgPQbrQPFi+84lA+0+zRO8/KLc3J6LvZWzxN3rXeJrCwWAO6n/C2uB4W1plnlw11Tp+2mvUvzFRCGkfcrf0QlLyx/nAIBdCj8jvB9QanszgL7pAU6aGj45/5c9fETeoLcVhpnP3TESt0yfaJtKeX5ILw8THMGbOfLpm3c7qOHlsyiE0tYGyajWJDkXwC+0ugZ5dDeC5BB3zluideKUX2OwOpH1rnze6JRNfHWwB9uhOW21m7UQBQAtK6FFjprJVuk1VVE/G7D4d4H8ft9Ub1Sr2syPpiCY0B6foQ== sudopod-dev-test"
}

# Make the POST request
response = requests.post(url, json=payload)

# Check if the request was successful
if response.status_code == 200:
    # Get the SSH URL from the response
    ssh_url = response.json()['ssh_url']

    # Split the SSH URL into username and host
    username, host = ssh_url.split('@')

    # Create a new SSH client
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    # Wait for a few seconds before trying to connect
    time.sleep(15)
    
    # Connect to the host
    print(f"username: {username}, host: {host}")
    private_key = paramiko.RSAKey.from_private_key_file('sudopod_dev_test_rsa')
    client.connect(host, port=22, username=username, pkey=private_key)

    # Open a new session and execute a command
    stdin, stdout, stderr = client.exec_command('pwd')

    print(stdout.read().decode())
    stdin.close()
    stdout.close()
    stderr.close()
    client.close()

else:
    print(f'Request failed with status code {response.status_code}')
    
    


# client = paramiko.SSHClient()
# client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
# private_key = paramiko.RSAKey.from_private_key_file('sudopod_dev_test_rsa')
# client.connect("35.247.36.77", port=22, username="sudopod-dev-test", pkey=private_key)

# stdin, stdout, stderr = client.exec_command('pwd')
# print(stdout.read().decode())
# stdin.close()
# stdout.close()
# stderr.close()
# client.close()
