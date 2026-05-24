import json
import os
import tempfile
import traceback
import zipfile
from pathlib import Path

import requests
from minio import Minio
from ultralytics import YOLO


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def callback(payload: dict):
    url = env("CALLBACK_URL")
    token = env("CALLBACK_TOKEN")
    if not url or not token:
        return
    headers = {
        "Content-Type": "application/json",
        "X-Training-Callback-Token": token,
    }
    requests.post(url, headers=headers, data=json.dumps(payload), timeout=20)


def resolve_model_path(download_path: Path, workdir_path: Path) -> Path:
    if zipfile.is_zipfile(download_path):
        model_dir = workdir_path / "model"
        model_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(download_path, "r") as zf:
            zf.extractall(model_dir)
        candidates = sorted(model_dir.rglob("*.pt"))
        if not candidates:
            raise FileNotFoundError("模型压缩包内未找到 .pt 权重文件")
        return candidates[0]
    return download_path


def main():
    training_id = env("TRAINING_ID")
    minio_endpoint = env("MINIO_ENDPOINT").replace("http://", "").replace("https://", "")
    minio_secure = env("MINIO_ENDPOINT").startswith("https://")
    minio_access_key = env("MINIO_ACCESS_KEY")
    minio_secret_key = env("MINIO_SECRET_KEY")
    minio_bucket = env("MINIO_BUCKET")
    model_object = env("MODEL_STORAGE_PATH")
    dataset_object = env("DATASET_STORAGE_PATH")

    hyper_params = {}
    try:
        hyper_params = json.loads(env("HYPER_PARAMS_JSON", "{}"))
    except Exception:
        hyper_params = {}

    epochs = int(hyper_params.get("epochs", env("DEFAULT_EPOCHS", "1")))
    imgsz = int(hyper_params.get("imgsz", env("DEFAULT_IMGSZ", "320")))
    batch = int(hyper_params.get("batch", hyper_params.get("batch_size", env("DEFAULT_BATCH", "2"))))
    device = str(hyper_params.get("device", env("DEFAULT_DEVICE", "cpu")))

    callback({
        "trainingId": training_id,
        "status": "running",
        "progress": 20,
    })

    with tempfile.TemporaryDirectory(prefix="tss-train-") as workdir:
        workdir_path = Path(workdir)
        dataset_zip = workdir_path / "dataset.zip"
        dataset_dir = workdir_path / "dataset"
        weights_path = workdir_path / "model.bin"
        output_dir = workdir_path / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)

        client = Minio(
            minio_endpoint,
            access_key=minio_access_key,
            secret_key=minio_secret_key,
            secure=minio_secure,
        )
        client.fget_object(minio_bucket, dataset_object, str(dataset_zip))
        client.fget_object(minio_bucket, model_object, str(weights_path))

        with zipfile.ZipFile(dataset_zip, "r") as zf:
            zf.extractall(dataset_dir)

        callback({
            "trainingId": training_id,
            "status": "running",
            "progress": 50,
            "logPath": f"local://{workdir}/train.log",
        })

        model = YOLO(str(resolve_model_path(weights_path, workdir_path)))
        result = model.train(
            data=str(dataset_dir / "data.yaml"),
            epochs=epochs,
            imgsz=imgsz,
            batch=batch,
            device=device,
            project=str(output_dir),
            name="exp",
            exist_ok=True,
            verbose=False,
        )

        metrics = {}
        if result and hasattr(result, "results_dict"):
            metrics = dict(result.results_dict)

        callback({
            "trainingId": training_id,
            "status": "success",
            "progress": 100,
            "metrics": metrics,
            "logPath": f"local://{workdir}/train.log",
            "outputPath": str(output_dir / "exp"),
        })


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        callback({
            "trainingId": env("TRAINING_ID"),
            "status": "failed",
            "progress": 0,
            "errorSummary": f"{exc}\n{traceback.format_exc()[:1500]}",
        })
        raise
