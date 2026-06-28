#!/usr/bin/env python3
"""TSS Platform 训练 Worker：按固定 trainingProfile 解压代码/数据 ZIP 并执行白名单命令。"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path, PurePosixPath

try:
    from minio import Minio
except ImportError:
    print("minio package not installed", file=sys.stderr)
    sys.exit(1)

WORKSPACE = Path("/workspace/job")

PROFILES = {
    "image_text_consistency_fusion_logreg": {
        "command": [
            "python",
            "scripts/training/train_fusion_baseline.py",
            "--data-dir",
            "data",
            "--model",
            "logreg",
            "--out-dir",
            "outputs/fusion_baseline_logreg",
        ],
        "metrics_path": "outputs/fusion_baseline_logreg/metrics.json",
        "output_dir": "outputs/fusion_baseline_logreg",
        "artifact_files": [
            "fusion_model.pkl",
            "metrics.json",
            "val_predictions.csv",
            "test_predictions.csv",
        ],
    }
}


def env(name: str, default: str = "") -> str:
    value = os.environ.get(name, default)
    return value.strip() if value else default


def log(msg: str) -> None:
    print(msg, flush=True)


def callback(
    status: str,
    progress: int,
    metrics=None,
    error_message=None,
    log_path=None,
    output_path=None,
) -> None:
    url = env("BACKEND_CALLBACK_URL")
    token = env("INTERNAL_CALLBACK_TOKEN")
    if not url:
        log("BACKEND_CALLBACK_URL 未设置，跳过回调")
        return
    payload: dict = {"status": status, "progress": progress}
    if metrics is not None:
        payload["metrics"] = metrics
    if error_message:
        payload["errorMessage"] = error_message
    if log_path:
        payload["logPath"] = log_path
    if output_path:
        payload["outputPath"] = output_path
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "X-Internal-Token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            log(f"回调成功: status={status}, http={resp.status}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"回调失败 HTTP {e.code}: {body}") from e


def parse_endpoint(endpoint: str) -> tuple[str, bool]:
    endpoint = endpoint.replace("http://", "").replace("https://", "")
    secure = env("MINIO_ENDPOINT", "").startswith("https")
    if "/" in endpoint:
        endpoint = endpoint.split("/", 1)[0]
    return endpoint, secure


def download_object(client: Minio, bucket: str, object_name: str) -> bytes:
    log(f"下载 MinIO 对象: {bucket}/{object_name}")
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def normalize_zip_name(name: str) -> str:
    return name.replace("\\", "/")


def is_safe_zip_member(name: str) -> bool:
    normalized = normalize_zip_name(name)
    if not normalized or normalized.endswith("/"):
        return False
    path = PurePosixPath(normalized)
    if path.is_absolute():
        return False
    return ".." not in path.parts


def safe_extract_zip(data: bytes, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(BytesIO(data)) as zf:
        for member in zf.infolist():
            name = normalize_zip_name(member.filename)
            if not is_safe_zip_member(name):
                raise ValueError(f"拒绝解压不安全路径: {name}")
            target = dest / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member, "r") as src, target.open("wb") as dst:
                dst.write(src.read())
            log(f"解压: {name}")


def upload_file(client: Minio, bucket: str, object_name: str, file_path: Path, content_type: str) -> None:
    log(f"上传产物: {object_name}")
    client.fput_object(bucket, object_name, str(file_path), content_type=content_type)


def flatten_metrics(raw: dict) -> dict:
    flat: dict = {"trainingProfile": env("TRAINING_PROFILE")}
    for split in ("train", "val", "test"):
        section = raw.get(split)
        if isinstance(section, dict):
            for key, value in section.items():
                flat[f"{split}_{key}"] = value
    for key in ("accuracy", "precision", "recall", "f1", "roc_auc"):
        if key in raw and key not in flat:
            flat[key] = raw[key]
    return flat


def run_profile_training(client: Minio, bucket: str, training_id: str, profile_name: str) -> None:
    profile = PROFILES.get(profile_name)
    if profile is None:
        raise ValueError(f"不支持的 trainingProfile: {profile_name}")

    code_path = env("CODE_STORAGE_PATH")
    dataset_path = env("DATASET_STORAGE_PATH")
    if not code_path or not dataset_path:
        raise ValueError("CODE_STORAGE_PATH 与 DATASET_STORAGE_PATH 均不能为空")

    callback("running", 10)
    WORKSPACE.mkdir(parents=True, exist_ok=True)

    code_bytes = download_object(client, bucket, code_path)
    dataset_bytes = download_object(client, bucket, dataset_path)
    callback("running", 25)

    safe_extract_zip(code_bytes, WORKSPACE)
    safe_extract_zip(dataset_bytes, WORKSPACE)
    callback("running", 40)

    command = profile["command"]
    if command[0].endswith(".sh"):
        raise ValueError("禁止执行 shell 脚本")

    log(f"执行固定 profile 命令: {' '.join(command)}")
    proc = subprocess.run(
        command,
        cwd=WORKSPACE,
        capture_output=True,
        text=True,
        check=False,
    )
    log(proc.stdout)
    if proc.stderr:
        log(proc.stderr)
    if proc.returncode != 0:
        raise RuntimeError(f"训练命令失败 exit={proc.returncode}: {proc.stderr[-2000:]}")

    callback("running", 85)

    metrics_path = WORKSPACE / profile["metrics_path"]
    if not metrics_path.exists():
        raise FileNotFoundError(f"缺少 metrics 文件: {metrics_path}")

    raw_metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    metrics = flatten_metrics(raw_metrics)

    output_prefix = f"training-results/{training_id}/artifacts"
    output_dir = WORKSPACE / profile["output_dir"]
    uploaded = []
    for file_name in profile["artifact_files"]:
        local_file = output_dir / file_name
        if not local_file.exists():
            log(f"跳过缺失产物: {local_file}")
            continue
        object_name = f"{output_prefix}/{file_name}"
        content_type = "application/json" if file_name.endswith(".json") else "application/octet-stream"
        if file_name.endswith(".csv"):
            content_type = "text/csv"
        upload_file(client, bucket, object_name, local_file, content_type)
        uploaded.append(object_name)

    log_object = f"training-results/{training_id}/train.log"
    log_text = "\n".join([
        f"trainingId={training_id}",
        f"profile={profile_name}",
        f"command={' '.join(command)}",
        proc.stdout[-4000:] if proc.stdout else "",
    ])
    client.put_object(
        bucket,
        log_object,
        BytesIO(log_text.encode("utf-8")),
        len(log_text.encode("utf-8")),
        content_type="text/plain",
    )

    callback(
        "success",
        100,
        metrics=metrics,
        log_path=f"minio://{log_object}",
        output_path=f"minio://{output_prefix}/",
    )


def main() -> None:
    training_id = env("TRAINING_ID", "unknown")
    profile_name = env("TRAINING_PROFILE")
    log(f"TSS Training Worker 启动: trainingId={training_id}, profile={profile_name}")

    if not profile_name:
        raise ValueError("TRAINING_PROFILE 不能为空")

    host, secure = parse_endpoint(env("MINIO_ENDPOINT", "http://tss-minio:9000"))
    client = Minio(
        host,
        access_key=env("MINIO_ACCESS_KEY"),
        secret_key=env("MINIO_SECRET_KEY"),
        secure=secure,
    )
    bucket = env("MINIO_BUCKET", "models")

    try:
        callback("running", 5)
        run_profile_training(client, bucket, training_id, profile_name)
        log("训练完成")
    except Exception as e:
        log(f"训练失败: {e}")
        callback("failed", 0, error_message=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
