import asyncio
import dataclasses
import re
import time
import uuid
from typing import Optional
import secrets

from config import Config
from dacite import from_dict
from datatypes import ActiveSession, RunningMachine, SshKey, UnallocatedMachine
from google.api_core import exceptions
from google.cloud import compute_v1, firestore
from pydantic import BaseModel
from ssh.ssh_keys import gen_ssh_key
from utils.firebase import (
    get_active_session_ref,
    get_db,
    get_running_machine_ref,
    get_unallocated_machine_ref,
)
from utils.setup import run_post_startup_script

CFG = Config()
logger = CFG.logger


class Instance(BaseModel):
    name: str
    project: str
    zone: str
    ssh_key: SshKey
    jupyter_access_token: str


def clean_string_for_gcp_instance(string):
    # Convert to lowercase
    string = string.lower()

    # Remove special characters and replace spaces with hyphens
    string = re.sub(r"[^a-z0-9]", "-", string)

    # Remove leading hyphens
    string = re.sub(r"^-+", "", string)

    # Remove trailing hyphens
    string = re.sub(r"-+$", "", string)

    # Truncate to 63 characters
    string = string[:63]

    return string


def retrieve_session(session_id: str, idempotency_key: str) -> Optional[ActiveSession]:
    # If session exists, just retrieve it
    active_session_doc = get_active_session_ref().document(session_id).get()
    if active_session_doc.exists:
        active_session: ActiveSession = from_dict(
            data_class=ActiveSession, data=active_session_doc.to_dict()
        )
        if active_session.idempotency_key == idempotency_key:
            logger.info(f"Found matching session for {session_id}")
            return active_session
        logger.info(
            f"Idempotency key did not match for session {session_id} and idempotency key {idempotency_key}, creating new active session"
        )


async def _convert_unallocated_machine(
    session_id: str, idempotency_key: str
) -> Optional[ActiveSession]:
    """Attempt to convert an existing unallocated machine, and turn it into a running machine. If anything fails in the process, return None (create a new machine)"""

    @firestore.transactional
    def transaction_convert_machine(transaction) -> Optional[UnallocatedMachine]:
        unallocated_machine_doc = list(
            get_unallocated_machine_ref()
            .where("project", "==", CFG.configs["project_name"])
            .order_by("created")
            .limit(1)
            .get(transaction=transaction)
        )
        if not unallocated_machine_doc or len(unallocated_machine_doc) < 1:
            return None

        unallocated_machine: UnallocatedMachine = from_dict(
            data_class=UnallocatedMachine, data=unallocated_machine_doc[0].to_dict()
        )
        logger.info(
            f"Found an unallocated machine for use, id: {unallocated_machine.id}"
        )

        running_machine_id = str(uuid.uuid4())
        running_machine: RunningMachine = RunningMachine(
            session_id=session_id,
            created=int(time.time() * 1000),
            expiry_date=int(
                time.time() * 1000
                + (1000 * 60 * 60 * CFG.configs["machine_expiry_hours"])
            ),  # 2 hour delay TODO add some param for TTL
            project=unallocated_machine.project,
            zone=unallocated_machine.zone,
            instance_name=unallocated_machine.instance_name,
        )
        running_machine_ref = get_running_machine_ref().document(running_machine_id)
        transaction.set(running_machine_ref, dataclasses.asdict(running_machine))
        transaction.delete(unallocated_machine_doc[0].reference)
        return unallocated_machine

    with get_db().transaction() as transaction:
        unallocated_machine: Optional[UnallocatedMachine] = transaction_convert_machine(
            transaction
        )
    if not unallocated_machine:
        return None

    if unallocated_machine.ssh_key:
        username = unallocated_machine.ssh_key.username
    else:
        raise Exception(f"No v2 ssh_key available when converting VM for session {session_id}")

    active_session = ActiveSession(
        session_id=session_id,
        idempotency_key=idempotency_key,
        created=int(time.time() * 1000),
        zone=unallocated_machine.zone,
        instance_name=unallocated_machine.instance_name,
        project=unallocated_machine.project,
        ssh_user=username,
        host_ip=unallocated_machine.host_ip,
        ssh_key=unallocated_machine.ssh_key
    )
    logger.info(
        f"Successfully converted unallocated machine {unallocated_machine.instance_name}"
    )
    get_active_session_ref().document(session_id).set(
        dataclasses.asdict(active_session)
    )
    return active_session


async def create_session(
    session_id: str, idempotency_key: str
) -> ActiveSession:
    # First check for unallocated machines
    active_session: Optional[ActiveSession] = await _convert_unallocated_machine(
        session_id, idempotency_key
    )
    if active_session:
        return active_session

    instance_uuid = str(uuid.uuid4())
    # No active session, no unallocated machines, start a new one up
    instance = Instance(
        name=f"a-{instance_uuid}",
        project=CFG.configs["project_name"],
        zone=CFG.zone,
        ssh_key=gen_ssh_key(),
        jupyter_access_token=secrets.token_hex(32),
    )

    # Create a running machine first. That way, we can track the lifecycle of this machine for killing it.
    running_machine_id = str(uuid.uuid4())
    running_machine: RunningMachine = RunningMachine(
        session_id=session_id,
        created=int(time.time() * 1000),
        expiry_date=int(
            time.time() * 1000 + (1000 * 60 * 60 * 2)
        ),  # 2 hour delay TODO add some param for TTL
        project=instance.project,
        zone=instance.zone,
        instance_name=instance.name,
    )
    get_running_machine_ref().document(running_machine_id).set(
        dataclasses.asdict(running_machine)
    )

    host_ip, ssh_user = await create_instance(instance)

    active_session = ActiveSession(
        session_id=session_id,
        idempotency_key=idempotency_key,
        created=int(time.time() * 1000),
        zone=instance.zone,
        instance_name=instance.name,
        project=instance.project,
        ssh_user=ssh_user,
        host_ip=host_ip,
        ssh_key=instance.ssh_key,
        jupyter_access_token=instance.jupyter_access_token,
    )

    get_active_session_ref().document(session_id).set(
        dataclasses.asdict(active_session)
    )
    return active_session


async def create_instance(instance: Instance, machine_type: str = "n1-standard-1"):
    client = compute_v1.InstancesClient()
    from utils.images import JUPYTER_IMAGE_V1

    # Create a new instance with the public key in its metadata
    instance_config = {
        "name": instance.name,
        "machine_type": f"zones/{instance.zone}/machineTypes/{machine_type}",
        "network_interfaces": [
            {
                "access_configs": [{"type_": "ONE_TO_ONE_NAT", "name": "External NAT"}],
                "network": "global/networks/default",
            }
        ],
        "disks": [
            {
                "boot": True,
                "auto_delete": True,
                "initialize_params": {"source_image": JUPYTER_IMAGE_V1},
            }
        ],
    }

    username = "sudopod"  # TODO probably pass this in later on?

    startup_script = f"#!/bin/bash\nusermod -aG sudo {username}"
    instance_config["metadata"] = {
        "items": [
            {"key": "ssh-keys", "value": f"{username}:{instance.ssh_key.public_key}"},
            {"key": "startup-script", "value": startup_script},
        ]
    }
        
    operation_obj = client.insert(
        project=instance.project, zone=instance.zone, instance_resource=instance_config
    )

    # Poll the operation until it's done
    operation_client = compute_v1.ZoneOperationsClient()
    start_time = time.time()
    timeout = 300  # Timeout after 5 minutes
    while True:
        result = operation_client.get(
            operation=operation_obj.name, project=instance.project, zone=instance.zone
        )
        if result.done:
            logger.info(f"Command finished, result was {result}")
            if result.error:
                raise Exception(f"Error: {result.error}")
            else:
                # Check the status of the instance
                instance_info = client.get(
                    project=instance.project, zone=instance.zone, instance=instance.name
                )
                logger.info(f"Instance info was {instance_info}")
                if instance_info.status == compute_v1.Instance.Status.RUNNING.name:
                    logger.info(f"Instance {instance.name} started up successfully!")
                    # Get the external IP address of the instance
                    external_ip = (
                        instance_info.network_interfaces[0].access_configs[0].nat_i_p
                    )
                    break
                else:
                    logger.error(
                        f"Instance failed to start up successfully: {instance_info}"
                    )
                    raise Exception("Instance failed to start up properly")

        elif time.time() - start_time > timeout:
            logger.error(f"Starting instance {instance}")
            # TODO shutdown instance if this occurs
            raise Exception("Operation timed out")
        else:
            # Wait for a few seconds before polling again
            await asyncio.sleep(3)
            
    await run_post_startup_script(username=username, host=external_ip, private_key=instance.ssh_key.private_key, jupyter_access_token=instance.jupyter_access_token)
    return external_ip, username


async def delete_instance(project: str, zone: str, name: str, error_on_not_found=False):
    client = compute_v1.InstancesClient()
    try:
        logger.info(
            f"Attemting to delete instance {name}"
        )  # Log the error message
        delete_operation = client.delete(
            project=project, zone=zone, instance=name
        )
        delete_operation.result()  # Wait for the operation to complete
    except exceptions.NotFound as e:
        if error_on_not_found:
            raise e
        # We want to ignore notfound errors, as that means we don't need to worry about deleting the instance
        logger.warn(f"Couldn't delete resource, continuing: {e}")


async def _reset_instance(instance: Instance):
    await delete_instance(instance.project, instance.zone, instance.name)
    # Recreate the instance
    host_ip, ssh_user = await create_instance(instance)
    return host_ip, ssh_user


async def reset_instance(session_id):
    active_session_doc = get_active_session_ref().document(session_id).get()
    if not active_session_doc.exists:
        raise Exception(f"Can't reset non existing instance {session_id}")
    active_session: ActiveSession = from_dict(
        data_class=ActiveSession, data=active_session_doc.to_dict()
    )

    instance = Instance(
        name=active_session.instance_name,
        project=active_session.project,
        zone=active_session.zone,
        ssh_key=active_session.ssh_key,
        jupyter_access_token=secrets.token_hex(32),
    )

    host_ip, ssh_user = await _reset_instance(instance)
    active_session = ActiveSession(
        session_id=session_id,
        idempotency_key=active_session.idempotency_key,
        created=int(time.time() * 1000),
        expiry_date=int(time.time() * 1000 + (1000 * 60 * 60 * 2)),
        zone=instance.zone,
        project=instance.project,
        instance_name=instance.name,
        ssh_user=ssh_user,
        host_ip=host_ip,
        ssh_key=instance.ssh_key
    )

    get_active_session_ref().document(session_id).set(
        dataclasses.asdict(active_session)
    )
    return active_session


def kill_instance(instance: Instance):
    print("TODO")
    # Make sure to remove ssh keys
