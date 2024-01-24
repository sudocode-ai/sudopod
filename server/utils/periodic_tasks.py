import dataclasses
import time
import uuid
from typing import List
import secrets

from config import Config
from constants import JUPYTER_PORT
from dacite import from_dict
from datatypes import RunningMachine, UnallocatedMachine
from ssh.ssh_keys import gen_ssh_key
from utils.deploy import Instance, create_instance, delete_instance
from utils.firebase import get_running_machine_ref, get_unallocated_machine_ref

CFG = Config()
logger = CFG.logger

CONFIGURED_PROJECT = CFG.configs["project_name"]


async def cleanup_vms():
    current_time = int(time.time() * 1000)

    expired_machines_doc = (
        get_running_machine_ref().where("expiry_date", "<", current_time).get()
    )

    # Delete the documents
    for expired_machine_doc in expired_machines_doc:
        expired_machine: RunningMachine = from_dict(
            data_class=RunningMachine, data=expired_machine_doc.to_dict()
        )
        if expired_machine.project != CONFIGURED_PROJECT:
            logger.info(
                f"Machine project is {expired_machine.project} and server is setup for {CONFIGURED_PROJECT}, skipping"
            )
            continue
        logger.info(
            f"Deleting machine {expired_machine.session_id} and id {expired_machine_doc.id} in {CONFIGURED_PROJECT}"
        )
        await delete_instance(
            project=expired_machine.project,
            zone=expired_machine.zone,
            name=expired_machine.instance_name, 
        )
        expired_machine_doc.reference.delete()


def _num_vms_needed() -> int:
    docs = (
        get_unallocated_machine_ref()
        .where("project", "==", CFG.configs["project_name"])
        .limit(CFG.min_unallocated_vms + 1)
        .get()
    )
    if len(docs) >= CFG.min_unallocated_vms:
        return 0
    else:
        return CFG.min_unallocated_vms - len(docs)


async def setup_vms():
    vms_to_start = _num_vms_needed()
    logger.info(f"Starting up {vms_to_start} vms")
    for i in range(vms_to_start):
        #TODO: setup jupyter access tokens
        ssh_key = gen_ssh_key()
        
        instance: Instance = Instance(
            name=f"a-{uuid.uuid4()}",
            project=CFG.configs["project_name"],
            zone=CFG.zone,
            ssh_key=ssh_key,
            jupyter_access_token=secrets.token_hex(32),
            jupyter_port=JUPYTER_PORT,
        )

        external_ip, username = await create_instance(
            instance, machine_type="n1-standard-1", 
        )

        unallocated_machine: UnallocatedMachine = UnallocatedMachine(
            id=instance.name,
            created=int(time.time() * 1000),
            project=instance.project,
            zone=instance.zone,
            instance_name=instance.name,
            machine_type="n1-standard-1",
            host_ip=external_ip,
            ssh_key=ssh_key,
            jupyter_access_token=instance.jupyter_access_token,
            jupyter_port=instance.jupyter_port
        )
        get_unallocated_machine_ref().document(unallocated_machine.id).set(
            dataclasses.asdict(unallocated_machine)
        )
