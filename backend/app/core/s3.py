import boto3
from botocore.config import Config

from app.core.config import settings


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT if settings.S3_ENDPOINT else None,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )


def get_s3_public_url(key: str) -> str:
    return f"https://{settings.S3_ENDPOINT}/{settings.S3_BUCKET}/{key}"
