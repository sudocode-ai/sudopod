import asyncssh
from io import BytesIO
import os

from config import logger

#UNUSED, but we could use later to run post-startup scripts if we want
async def run_command(host: str, user: str, private_key_str: str, contents: str, filepath: str):
    private_key = asyncssh.import_private_key(private_key_str)
    remote_path = f"/home/{user}/{filepath}"
    try:
        async with asyncssh.connect(host, username=user, client_keys=[private_key], known_hosts=None) as conn:
            logger.debug(f"Loading file {remote_path}, contents: {contents}")
            fl = BytesIO()
            fl.write((contents).encode())
            fl.seek(0)

            # Create directories if they don't exist
            await conn.run(f"mkdir -p {os.path.dirname(remote_path)}")

            async with conn.start_sftp_client() as sftp:
                async with sftp.open(remote_path, "wb") as remote_file:
                    await remote_file.write(fl.getvalue())
            logger.debug(f"Loaded file {filepath}")
            
            command = f'sudo bash {remote_path}'
            result = await conn.run(command, check=True)
            logger.info(f"Result of running command was: {result.stdout}")
    except (OSError, asyncssh.Error) as e:
        logger.error('SSH connection failed: ', str(e))
        raise e


async def connect(host: str, user: str, private_key_str: str):
    private_key = asyncssh.import_private_key(private_key_str)
    async with asyncssh.connect(host, username=user, client_keys=[private_key], known_hosts=None) as conn:
        logger.info(f"Connected successfuly to {host}")
        return

