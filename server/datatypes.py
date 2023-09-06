# TODO: Change to protobufs or some other serialization format.

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Set


#For the future
@dataclass
class SshKey:
    org_id: str
    users: Set[str]
    sessions: List[str] = field(default_factory=list)


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
    public_key: str
    zone: str
    instance_name: Optional[str]
    project: str
    host_ip: str
    ssh_user: str
    expiry_date: Optional[int] = 0 #DEPRECATED


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
