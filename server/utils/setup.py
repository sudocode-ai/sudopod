from scripts.startup_scripts import STARTUP_SCRIPT
from ssh.ssh_client import run_command

async def run_post_startup_script(username: str, host: str, private_key: str, jupyter_access_token: str, jupyter_port: str):
    startup_script = STARTUP_SCRIPT.format(username=username, host=host, jupyter_access_token=jupyter_access_token, jupyter_port=jupyter_port)
    await run_command(host=host, user=username, private_key_str=private_key, command=startup_script)