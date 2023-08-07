import paramiko

key = paramiko.RSAKey.generate(2048)
key.write_private_key_file("/path/to/mykey.private")
public_key = key.get_base64()

