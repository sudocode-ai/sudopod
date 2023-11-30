from typing import Optional

from config import Config
from datatypes import ActiveSession
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from utils.deploy import create_session, reset_instance, retrieve_session
from utils.periodic_tasks import cleanup_vms, setup_vms

CFG = Config()
logger = CFG.logger

deploy_http_router = APIRouter()


class ConnectMachineRequest(BaseModel):
    session_id: str
    super_secret: str
    idempotency_key: str
    public_key: Optional[str] = None


@deploy_http_router.post("/session", status_code=200)
async def connect_machine(req: ConnectMachineRequest):
    if req.super_secret != "Arlington doodads popguns":
        raise HTTPException(status_code=403, detail="Unauthorized")
    session: Optional[ActiveSession] = retrieve_session(
        req.session_id, req.idempotency_key
    )
    if not session:
        session = await create_session(
            req.session_id, req.idempotency_key
        )
    response = {
        "status": "success",
        "host": session.host_ip,
        "ssh_user": session.ssh_user,
        "jupyter_access_token": session.jupyter_access_token
        
    }
    if session.ssh_key:
        response["ssh_private_key"] = session.ssh_key.private_key
    return response


@deploy_http_router.post("/session/{session_id}/reset", status_code=200)
async def reset_machine(
    session_id: str,
):
    session: ActiveSession = await reset_instance(session_id)
    response = {
        "status": "success",
        "host": session.host_ip,
        "ssh_user": session.ssh_user,
        "jupyter_access_token": session.jupyter_access_token,
    }
    return response


class PeriodicTaskReq(BaseModel):
    super_secret: str


@deploy_http_router.post("/setup_teardown_vms", status_code=200)
async def setup_teardown_vms(req: PeriodicTaskReq):
    if req.super_secret != "Arlington doodads popguns":
        raise HTTPException(status_code=403, detail="Unauthorized")
    await cleanup_vms()
    await setup_vms()
    response = {"status": "success"}
    return response
