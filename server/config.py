import json
import logging
import os
from logging import StreamHandler
from pathlib import Path
from typing import Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


class Singleton(type):
    _instances = {}

    def __call__(cls, *args, **kwargs):
        if cls not in cls._instances:
            cls._instances[cls] = super().__call__(*args, **kwargs)
        return cls._instances[cls]


def get_cred_config() -> Dict[str, str]:
    """Retrieve Cloud credentials stored in Secret Manager
    or default to environment variables."""
    secret = os.environ.get("CLOUD_SECRETS")
    if secret:
        return json.loads(secret)


class Config(metaclass=Singleton):
    """Configuration class for different script access."""

    def __init__(self) -> None:
        """Initialize the Config class"""
        # TODO: Move these to a constants singleton.
        self.app = FastAPI()
        curdir = Path(os.path.abspath(os.path.dirname(os.path.realpath(__file__))))

        env = os.environ.get("ENV", "dev")
        self.env = env
        # Refer to configs/config-{env}.json for the different configuration choices.
        if env == "dev":
            with open(os.path.join(curdir, "configs/keys.json")) as f:
                self.keys = json.load(f)
            with open(os.path.join(curdir, "configs/config-dev.json")) as f:
                self.configs = json.load(f)
        elif env == "staging":
            self.keys = get_cred_config()
            with open(os.path.join(curdir, "configs/config-staging.json")) as f:
                self.configs = json.load(f)
        elif env == "prod":
            self.keys = get_cred_config()
            with open(os.path.join(curdir, "configs/config-prod.json")) as f:
                self.configs = json.load(f)
        # else:
        #    raise Exception("wtf man no deploy env set")
        self.verbose = True
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=self.configs["allowed_origins"],
            allow_methods=["*"],
            allow_headers=["*"],
            allow_credentials=True,
            expose_headers=[],
        )
        log_level = logging.INFO
        if self.configs["log_level"] == "debug":
            log_level = logging.DEBUG

        logger = logging.getLogger(__name__)
        logger.setLevel(log_level)
        handler = StreamHandler()
        handler.setLevel(log_level)
        logger.addHandler(handler)
        logger.warn(f"WARNING: running in {env} mode")

        self.logger = logger

        self.admin_emails = [
            "alex@sudocode.ai",
            "ssh.randy@sudocode.ai",
            "timbaker@sudocode.ai",
        ]
        self.zone = "us-west1-a"

        self.min_unallocated_vms = self.configs["min_unallocated_vms"]

logger = Config().logger