FROM python:3.11-slim

WORKDIR /app

COPY analytics/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY analytics/ ./analytics/

ENV PYTHONPATH=/app/analytics
ENV QI_INGEST_PHASE=polygon,fmp
ENV PYTHONUNBUFFERED=1

CMD ["python3", "-m", "qi.scheduler"]
