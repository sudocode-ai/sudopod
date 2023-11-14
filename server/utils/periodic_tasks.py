import dataclasses
import time
import uuid
from typing import List

from config import Config
from dacite import from_dict
from datatypes import RunningMachine, UnallocatedMachine
from utils.deploy import Instance, create_instance, delete_instance
from utils.firebase import get_running_machine_ref, get_unallocated_machine_ref

CFG = Config()
logger = CFG.logger


MACHINE_COUNTER_ID = "12345"
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

        instance: Instance = Instance(
            name=expired_machine.instance_name,
            project=expired_machine.project,
            zone=expired_machine.zone,
        )
        await delete_instance(instance)
        expired_machine_doc.reference.delete()


def _num_vms_needed():
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
    for i in range(_num_vms_needed()):
        instance: Instance = Instance(
            name=f"a-{uuid.uuid4()}",
            project=CFG.configs["project_name"],
            zone=CFG.zone,
        )

        external_ip, username = await create_instance(
            instance, machine_type="n1-standard-1"
        )

        unallocated_machine: UnallocatedMachine = UnallocatedMachine(
            id=instance.name,
            created=int(time.time() * 1000),
            project=instance.project,
            zone=instance.zone,
            instance_name=instance.name,
            machine_type="n1-standard-1",
            host_ip=external_ip,
        )
        get_unallocated_machine_ref().document(unallocated_machine.id).set(
            dataclasses.asdict(unallocated_machine)
        )
