from dacite import from_dict

import dataclasses
import time
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from config import Config
from datatypes import ActiveSession
from utils.deploy import retrieve_session, reset_instance
from utils.periodic_tasks import cleanup_vms, setup_vms

CFG = Config()
logger = CFG.logger

deploy_http_router = APIRouter()

class ConnectMachineRequest(BaseModel):
    session_id: str
    public_key: str
    super_secret: str
    idempotency_key: str
    

@deploy_http_router.post("/session", status_code=200)
async def connect_machine(
    req: ConnectMachineRequest
):
    if req.super_secret != "Arlington doodads popguns":
        raise HTTPException(status_code=403, detail="Unauthorized")
    active_session: ActiveSession = await retrieve_session(req.session_id, req.public_key, req.idempotency_key)
    response = {"status": "success", "host": active_session.host_ip, "ssh_user": active_session.ssh_user}
    return response
    

    
@deploy_http_router.post("/session/{session_id}/reset", status_code=200)
async def connect_machine(
    session_id: str,
):
    active_session: ActiveSession = await reset_instance(session_id)
    response = {"status": "success", "host": active_session.host_ip, "ssh_user": active_session.ssh_user}
    return response
    

class PeriodicTaskReq(BaseModel):
    super_secret: str
    
@deploy_http_router.post("/setup_teardown_vms", status_code=200)
async def setup_teardown_vms(
    req: PeriodicTaskReq
):
    if req.super_secret != "Arlington doodads popguns":
        raise HTTPException(status_code=403, detail="Unauthorized")
    await cleanup_vms()
    await setup_vms()
    response = {"status": "success"}
    return response
    

