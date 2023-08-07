from modal import Image, Stub, asgi_app, Mount

stub = Stub("deployment-98065")

image = Image.from_dockerfile("Dockerfile.modal", context_mount=Mount.from_local_dir(".", remote_path="/"))

@stub.function(image=image, memory=1024, cpu=2.0)
@asgi_app(label="deployment-98065")
def web_app():
    from test.deploy_gcr import app
    return app