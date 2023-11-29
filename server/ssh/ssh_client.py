import asyncssh
from asyncssh import SSHClientProcess, SSHClientConnection, SSHClientChannel
from typing import NamedTuple

class SshClient(NamedTuple):
  conn: SSHClientConnection
  process: SSHClientProcess
  channel: SSHClientChannel  # Add reference to the channel

async def connect_ssh(host: str, ssh_user: str, ):
    private_key = asyncssh.import_private_key(terminal.ssh_key.private_key)
    conn: SSHClientConnection = await asyncssh.connect(terminal.host, username=terminal.ssh_user, client_keys=[private_key], known_hosts=None)
    process: SSHClientProcess = await conn.create_process(term_type='xterm')
    return SshClient(conn, process, process.channel)
