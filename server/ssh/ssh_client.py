import asyncssh

from config import logger

async def run_command(host: str, user: str, private_key_str: str, command: str):
    private_key = asyncssh.import_private_key(private_key_str)
    try:
        # Connect to the server
        async with asyncssh.connect(host, username=user, client_keys=[private_key], known_hosts=None) as conn:
            result = await conn.run(command, check=True)
            logger.info(f"Result of running command was: {result.stdout}")
    except (OSError, asyncssh.Error) as e:
        logger.error('SSH connection failed: ', str(e))
        raise e
