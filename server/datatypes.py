# TODO: Change to protobufs or some other serialization format.

from dataclasses import dataclass, field
from typing import List, Optional, Set


@dataclass
class SshKey:
    username: str
    private_key: str
    public_key: str


@dataclass
class RunningMachine:
    session_id: str
    created: int
    expiry_date: int
    project: str
    zone: str
    instance_name: str


@dataclass
class ActiveSession:
    session_id: str
    idempotency_key: Optional[str]
    created: int
    zone: str
    instance_name: Optional[str]
    project: str
    host_ip: str
    ssh_user: str
    ssh_key: SshKey
    jupyter_access_token: str
    jupyter_port: int


@dataclass
class UnallocatedMachine:
    id: str
    created: int
    project: str
    zone: str
    instance_name: str
    zone: str
    machine_type: str
    host_ip: str
    ssh_key: SshKey
    jupyter_access_token: str
    jupyter_port: int
