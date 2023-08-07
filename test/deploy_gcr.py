from google.cloud import storage
from google.cloud.devtools import cloudbuild_v1
import tarfile
import os
import subprocess

def create_tar_file(source_folder, target):
    with tarfile.open(target, 'w:gz') as tar:
        for root, dirs, files in os.walk(source_folder):
            for file in files:
                full_path = os.path.join(root, file)
                tar.add(full_path, arcname=os.path.relpath(full_path, source_folder))
                

def upload_blob(bucket_name, source_file_name, destination_blob_name):
    """Uploads a file to the bucket."""
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(destination_blob_name)

    blob.upload_from_filename(source_file_name)


def create_build(project_id, bucket_name, tar_name):
    client = cloudbuild_v1.CloudBuildClient()

    storage_source = cloudbuild_v1.StorageSource(bucket=bucket_name, object=tar_name)
    source = cloudbuild_v1.Source(storage_source=storage_source)

    build = cloudbuild_v1.Build()
    build.source = source
    build.steps = [
        {
            'name': 'gcr.io/cloud-builders/docker',
            'args': ['build', '--no-cache', '-t', f'gcr.io/{project_id}/fastapi-server', '.']
        }
    ]
    build.images = [f'gcr.io/{project_id}/fastapi-server']

    operation = client.create_build(project_id=project_id, build=build)
    print(f'Build created: {operation.metadata.build.id}')


def create_bucket(bucket_name):
    """Creates a new bucket."""
    storage_client = storage.Client()

    bucket = storage_client.bucket(bucket_name)
    new_bucket = storage_client.create_bucket(bucket)

    print(f'Bucket {new_bucket.name} created')


def deploy_to_cloud_run(project_id, image_name, service_name):
    """Deploys the image to Cloud Run."""
    command = [
        'gcloud', 'run', 'deploy', service_name,
        '--image', f'gcr.io/{project_id}/{image_name}',
        '--platform', 'managed',
        '--region', 'us-west1',
        '--allow-unauthenticated'
    ]

    process = subprocess.Popen(command, stdout=subprocess.PIPE)
    output, error = process.communicate()

    if error:
        print(f'Error occurred: {error}')
    else:
        print(f'Successfully deployed to Cloud Run: {output}')


def create_domain_mapping(project_id, service_name, domain):
    """Creates a domain mapping for the service."""
    command = [
        'gcloud', 'beta', 'run', 'domain-mappings', 'create',
        '--service', service_name,
        '--domain', domain,
        '--project', project_id,
        '--platform', 'managed',
        '--region', 'us-west1'
    ]

    process = subprocess.Popen(command, stdout=subprocess.PIPE)
    output, error = process.communicate()

    if error:
        print(f'Error occurred: {error}')
    else:
        print(f'Successfully created domain mapping: {output}')


def main():
    project_id = 'sudopod-staging'
    user_id = "123443211"
    deployment_num = "4"
    bucket_name = f"{project_id}-{user_id}-{deployment_num}"
    source_folder = "generated_code/test"
    tar_name = 'source.tar.gz'
    image_name = 'fastapi-server'
    service_name = 'fastapi-service'
    domain = f"{user_id}-{deployment_num}.app.sudocode.ai"

    create_bucket(bucket_name)
    create_tar_file(source_folder, tar_name)
    upload_blob(bucket_name, tar_name, tar_name)
    create_build(project_id, bucket_name, tar_name)

    deploy_to_cloud_run(project_id, image_name, service_name)
    create_domain_mapping(project_id, service_name, domain)
    os.remove(tar_name)

if __name__ == '__main__':
    main()

