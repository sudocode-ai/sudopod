from dacite import from_dict

import asyncio
import dataclasses
from google.cloud import compute_v1
from google.api_core import operation
import re
import time
from typing import Optional

from datatypes import ActiveSession, UnallocatedMachineCount
from utils.firebase import get_active_session_ref, get_unallocated_machine_count_ref

from config import Config
CFG = Config()
logger = CFG.logger


class Instance():
    name: str
    project: str
    zone: str
    ssh_public_key: Optional[str] = None

def clean_string_for_gcp_instance(string):
    # Convert to lowercase
    string = string.lower()

    # Remove special characters and replace spaces with hyphens
    string = re.sub(r'[^a-z0-9]', '-', string)

    # Remove leading hyphens
    string = re.sub(r'^-+', '', string)

    # Remove trailing hyphens
    string = re.sub(r'-+$', '', string)

    # Truncate to 63 characters
    string = string[:63]

    return string


async def retrieve_session(session_id, public_key) -> ActiveSession:
    
    # If session exists, just retrieve it
    active_session_doc = get_active_session_ref().document(session_id).get()
    if active_session_doc.exists:
        return from_dict(data_class=ActiveSession, data=active_session_doc.to_dict())
    
    # First check for unallocated machines (not fully implemented yet)
    unallocated_machine_count_doc = next(iter(get_unallocated_machine_count_ref().limit(1).stream()), None)
    if unallocated_machine_count_doc is not None:
        unallocated_machine_count = unallocated_machine_count_doc.to_dict()
        if len(unallocated_machine_count.unallocated_machines) > 0:
            raise Exception("This isn't implemented yet lol")
    
    # No active session, no unallocated machines, start a new one up
    instance = Instance()
    instance.name = f"a-{session_id}"
    instance.project = CFG.configs["project_name"]
    instance.zone = CFG.zone
    instance.ssh_public_key = public_key
    
    host_ip, ssh_user = await _create_instance(instance)
    
    #TODO Replace TTL with some config or param?
    active_session = ActiveSession(
        session_id=session_id,
        created=int(time.time() * 1000),
        ttl=int(time.time() * 1000 + (1000*60*60*2)),
        public_key=public_key,
        zone=instance.zone,
        instance_name=instance.name,
        project=instance.project,
        ssh_user=ssh_user,
        host_ip=host_ip
    )
    
    get_active_session_ref().document(session_id).set(dataclasses.asdict(active_session))
    return active_session
    
    
async def _create_instance(instance: Instance):
    client = compute_v1.InstancesClient()
    from utils.images import PYTHON_3_11_4_PIPREQ_IMAGE
    # Create a new instance with the public key in its metadata
    instance_config = {
        "name": instance.name,
        "machine_type": f"zones/{instance.zone}/machineTypes/n1-standard-1",
        "network_interfaces": [{
            "access_configs": [{
                "type_": "ONE_TO_ONE_NAT",
                "name": "External NAT"
            }],
            "network": "global/networks/default"
        }],
        "disks": [{
            "boot": True,
            "auto_delete": True,
            "initialize_params": {
                "source_image": PYTHON_3_11_4_PIPREQ_IMAGE
            }
        }]
    }
    
    if instance.ssh_public_key:
        username = "sudopod" #TODO probably pass this in later on?
        startup_script = f"#!/bin/bash\nusermod -aG sudo {username}"
        instance_config["metadata"] = {
            "items": [{
                "key": "ssh-keys",
                "value": f"{username}:{instance.ssh_public_key}"
            }, {
                "key": "startup-script",
                "value": startup_script
            }]
        }

    operation_obj = client.insert(project=instance.project, zone=instance.zone, instance_resource=instance_config)

    # Poll the operation until it's done
    operation_client = compute_v1.ZoneOperationsClient()
    start_time = time.time()
    timeout = 300  # Timeout after 5 minutes
    while True:
        result = operation_client.get(
            operation=operation_obj.name,
            project=instance.project,
            zone=instance.zone
        )
        if result.done:
            logger.info(f"Command finished, result was {result}")
            if result.error:
                raise Exception(f"Error: {result.error}")
            else:
                # Check the status of the instance
                instance_info = client.get(project=instance.project, zone=instance.zone, instance=instance.name)
                logger.info(f"Instance info was {instance_info}")
                if instance_info.status == compute_v1.Instance.Status.RUNNING.name:
                    logger.info(f"Instance {instance.name} started up successfully!")
                    # Get the external IP address of the instance
                    external_ip = instance_info.network_interfaces[0].access_configs[0].nat_i_p
                    # Return the SSH URL
                    return external_ip, username
                else:
                    logger.error(f"Instance failed to start up successfully: {instance_info}")
                    raise Exception("Instance failed to start up properly")
            
        elif time.time() - start_time > timeout:
            logger.error(f"Starting instance {instance.instance}")
            #TODO shutdown instance if this occurs
            raise Exception("Operation timed out")
        else:
            # Wait for a few seconds before polling again
            await asyncio.sleep(3)


async def _reset_instance(instance: Instance):
    client = compute_v1.InstancesClient()

    # Delete the existing instance
    delete_operation = client.delete(
        project=instance.project, 
        zone=instance.zone, 
        instance=instance.name
    )
    delete_operation.result()  # Wait for the operation to complete

    # Recreate the instance
    host_ip, ssh_user = await _create_instance(instance)
    return host_ip, ssh_user
    
async def reset_instance(session_id):
    active_session_doc = get_active_session_ref().document(session_id).get()
    if not active_session_doc.exists:
        raise Exception(f"Can't reset non existing instance {session_id}")
    active_session: ActiveSession = from_dict(data_class=ActiveSession, data=active_session_doc.to_dict())
   
    instance = Instance()
    instance.name = active_session.instance_name
    instance.project = active_session.project
    instance.zone = active_session.zone
    instance.ssh_public_key = active_session.public_key
    
    host_ip, ssh_user = await _reset_instance(instance)
    active_session = ActiveSession(
        session_id=session_id,
        created=int(time.time() * 1000),
        ttl=int(time.time() * 1000 + (1000*60*60*2)),
        public_key=instance.ssh_public_key,
        zone=instance.zone,
        project=instance.project,
        instance_name=instance.name,
        ssh_user=ssh_user,
        host_ip=host_ip
    )
    
    get_active_session_ref().document(session_id).set(dataclasses.asdict(active_session))
    return active_session


def kill_instance(instance: Instance):
    print("TODO")
    # Make sure to remove ssh keys


