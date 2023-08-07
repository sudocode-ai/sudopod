from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

@app.get("/hello")
def read_root():
    return {"Hello": "World"}


app.mount("/", StaticFiles(directory="assets", html=True), name="assets")
