import secrets
from scripts.startup_scripts import STARTUP_SCRIPT
from ssh.ssh_client import run_command

async def ran_startup(username: str, host: str, private_key: str):
    jupyter_access_token = secrets.token_hex(32)
    startup_script = STARTUP_SCRIPT.format(username=username, host=host, jupyter_access_token=jupyter_access_token)
    await run_command(host=host, username=username, private_key_str=private_key, command=startup_script)