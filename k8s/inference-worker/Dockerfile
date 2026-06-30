FROM tss/yolo-trainer-cpu:latest

WORKDIR /app

RUN useradd -r -u 10001 -m worker 2>/dev/null || true \
    && mkdir -p /workspace/job \
    && chown -R worker:worker /workspace

COPY requirements.txt .
RUN python -m pip uninstall -y opencv-python opencv-contrib-python opencv-contrib-python-headless || true \
    && python -m pip install --no-cache-dir -r requirements.txt \
    -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY infer_worker.py .

USER 10001

ENTRYPOINT ["python", "/app/infer_worker.py"]
