FROM python:3.11-slim

WORKDIR /app

ENV PIP_NO_CACHE_DIR=1

COPY requirements.txt /app/requirements.txt
RUN pip install --timeout 120 -i https://pypi.tuna.tsinghua.edu.cn/simple -r /app/requirements.txt

COPY train.py /app/train.py

ENTRYPOINT ["python", "/app/train.py"]
