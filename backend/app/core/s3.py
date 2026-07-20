import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings


def get_s3_client():
    kwargs = dict(
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )
    if settings.S3_ENDPOINT:
        endpoint = settings.S3_ENDPOINT.rstrip("/")
        kwargs["endpoint_url"] = endpoint
        kwargs["config"] = Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        )
    return boto3.client("s3", **kwargs)


def get_s3_public_url(key: str) -> str:
    if settings.S3_ENDPOINT:
        endpoint = settings.S3_ENDPOINT.rstrip("/")
        return f"{endpoint}/{settings.S3_BUCKET}/{key}"
    return f"https://{settings.S3_BUCKET}.s3.amazonaws.com/{key}"
