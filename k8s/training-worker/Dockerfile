FROM python:3.11-slim

WORKDIR /app

RUN useradd -r -u 10001 -m worker && mkdir -p /workspace/job && chown -R worker:worker /workspace

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY train.py .

USER 10001

ENTRYPOINT ["python", "/app/train.py"]
