import os
from pathlib import Path

from config import Config
from firebase_admin import credentials, firestore, initialize_app

CFG = Config()

## TODO figure out how to run init on each thread


# Initialize keys.
curdir = Path(os.path.abspath(os.path.dirname(os.path.realpath(__file__))))
pardir = curdir.parent.absolute()
# Initialize Firebase.
if CFG.configs["debug_mode"]:
    firebase_key_path = os.path.join(pardir, CFG.configs["firebase-key-path"])
    cred = credentials.Certificate(firebase_key_path)
else:
    print("initializing firebase key")
    cred = credentials.Certificate(CFG.configs["firebase-key-path"])
initialize_app(cred)
print("initialized firebase")

db = firestore.client()
ssh_key_ref = db.collection("ssh_key")
active_session_ref = db.collection("active_session")
unallocated_machine_ref = db.collection("unallocated_machine")
running_machine_ref = db.collection("running_machine")
print("db initialized")


# TODO: Use proper factory pattern.
def get_ssh_key_ref():
    return ssh_key_ref


def get_active_session_ref():
    return active_session_ref


def get_unallocated_machine_ref():
    return unallocated_machine_ref


def get_running_machine_ref():
    return running_machine_ref


def get_db():
    return db
