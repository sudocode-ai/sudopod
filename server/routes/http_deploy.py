from dacite import from_dict

import dataclasses
import time
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from config import Config
from datatypes import ActiveSession
from utils.deploy import retrieve_session
from utils.firebase import get_active_session_ref

CFG = Config()
logger = CFG.logger

deploy_http_router = APIRouter()

class ConnectMachineRequest(BaseModel):
    session_id: str
    public_key: str
    super_secret: str
    


@deploy_http_router.post("/session", status_code=200)
async def connect_machine(
    req: ConnectMachineRequest
):
    if req.super_secret != "Arlington doodads popguns":
        raise HTTPException(status_code=403, detail="Unauthorized")
    active_session: ActiveSession = await retrieve_session(req.session_id, req.public_key)
    response = {"status": "success", "host": active_session.host_ip, "ssh_user": active_session.ssh_user}
    return response
    
