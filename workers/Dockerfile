FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-por \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir uv && uv pip install --system -r <(uv pip compile pyproject.toml -o -)

COPY . .

CMD ["arq", "app.main:ARQ_SETTINGS", "--workers", "4"]
