"""Entry point for the backend server.

Example command to run: uvicorn app:app --host 0.0.0.0 --port 8420
"""
from config import Config
from routes.http_deploy import deploy_http_router

CFG = Config()
app = CFG.app
app.include_router(deploy_http_router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=CFG.configs["port"])
