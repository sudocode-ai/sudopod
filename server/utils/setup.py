import asyncio
import httpx

from config import logger
from ssh.ssh_client import connect


async def run_post_startup(username: str, host: str, private_key: str, jupyter_access_token: str, jupyter_port: int):
    
    MAX_ATTEMPT = 30
    await asyncio.sleep(1)
    attempt = 0
    while attempt < MAX_ATTEMPT:
        try:
            await connect(host=host, user=username, private_key_str=private_key)
            break  # If it reaches here, we succeeded.
        except:
            logger.debug(f"test connection not ready yet for terminal {host}")
        await asyncio.sleep(1)
        attempt += 1
        if attempt > MAX_ATTEMPT:
            raise Exception(
                f"Failed too many times trying to test connection to terminal {host}"
            )

    url = f"http://{host}:{jupyter_port}/api/status"
    
    # TODO: Find out why the docker container/jupyter server takes so long to start up
    RETRY_ATTEMPTS = 30
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers={
                        "Authorization": f"token {jupyter_access_token}",
                    },
                    timeout=5.0,
                )
                logger.info(f"Successfully hit jupyter for vm {host}")
            # If the request is successful, break out of the loop
            break
        except Exception as e:
            if attempt >= RETRY_ATTEMPTS:
                logger.error(f"Attempt {attempt}: Failed to send start request to jupyter kernel for vm {host}, exception: {e}")
                return None
            await asyncio.sleep(1)
    
    return