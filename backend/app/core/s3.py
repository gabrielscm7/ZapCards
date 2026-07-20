import os
import logging

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)


def _ensure_local_path():
    if settings.DEV_USE_LOCAL_STORAGE:
        os.makedirs(settings.LOCAL_STORAGE_PATH, exist_ok=True)


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
    if settings.DEV_USE_LOCAL_STORAGE:
        return f"{settings.FRONTEND_URL}/api/files/{key}"
    if settings.S3_ENDPOINT:
        endpoint = settings.S3_ENDPOINT.rstrip("/")
        return f"{endpoint}/{settings.S3_BUCKET}/{key}"
    return f"https://{settings.S3_BUCKET}.s3.amazonaws.com/{key}"


def save_file(key: str, content: bytes):
    if settings.DEV_USE_LOCAL_STORAGE:
        _ensure_local_path()
        filepath = os.path.join(settings.LOCAL_STORAGE_PATH, key)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "wb") as f:
            f.write(content)
        logger.info("Saved file locally: %s", filepath)
        return

    s3 = get_s3_client()
    try:
        s3.put_object(Bucket=settings.S3_BUCKET, Key=key, Body=content)
    except (ClientError, Exception) as e:
        logger.error("S3 upload failed: %s", e)
        raise


def get_file(key: str) -> bytes | None:
    if settings.DEV_USE_LOCAL_STORAGE:
        filepath = os.path.join(settings.LOCAL_STORAGE_PATH, key)
        if os.path.exists(filepath):
            with open(filepath, "rb") as f:
                return f.read()
        return None

    s3 = get_s3_client()
    try:
        obj = s3.get_object(Bucket=settings.S3_BUCKET, Key=key)
        return obj["Body"].read()
    except (ClientError, Exception) as e:
        logger.error("S3 download failed: %s", e)
        return None
