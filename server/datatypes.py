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
class ActiveSession:
    session_id: str
    idempotency_key: Optional[str]
    created: int
    expiry_date: int
    public_key: str
    zone: str
    instance_name: Optional[str]
    project: str
    host_ip: str
    ssh_user: str


@dataclass
class UnallocatedMachineCount:
    uid: str
    created: int
    unallocated_machines: List[str] = field(default_factory=list)
    

@dataclass
class UnallocatedMachine:
    uid: str
    created: int
    machine_type: str
    zone: str
