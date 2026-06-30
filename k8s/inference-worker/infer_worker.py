#!/usr/bin/env python3
"""TSS Platform inference worker.

The backend owns authorization and task state. This worker only prepares an
isolated workspace, runs the uploaded Python entry file, uploads artifacts, and
reports status back through the internal callback API.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path, PurePosixPath

from minio import Minio

WORKSPACE = Path("/workspace/job")
MODEL_DIR = WORKSPACE / "model"
SCRIPT_DIR = WORKSPACE / "script"
INPUT_DIR = WORKSPACE / "input"
OUTPUT_DIR = WORKSPACE / "output"
LOG_FILE = WORKSPACE / "infer.log"


def env(name: str, default: str = "") -> str:
    value = os.environ.get(name, default)
    return value.strip() if value else default


def log(message: str) -> None:
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {message}"
    print(line, flush=True)
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as file:
        file.write(line + "\n")


def parse_endpoint(endpoint: str) -> tuple[str, bool]:
    secure = endpoint.startswith("https://")
    endpoint = endpoint.replace("http://", "").replace("https://", "")
    if "/" in endpoint:
        endpoint = endpoint.split("/", 1)[0]
    return endpoint, secure


def minio_client() -> tuple[Minio, str]:
    endpoint, secure = parse_endpoint(env("MINIO_ENDPOINT"))
    bucket = env("MINIO_BUCKET", "models")
    client = Minio(
        endpoint,
        access_key=env("MINIO_ACCESS_KEY"),
        secret_key=env("MINIO_SECRET_KEY"),
        secure=secure,
    )
    return client, bucket


def download_object(client: Minio, bucket: str, object_name: str) -> bytes:
    if not object_name:
        raise ValueError("object name is empty")
    log(f"download minio object: {bucket}/{object_name}")
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def normalize_zip_name(name: str) -> str:
    return (name or "").replace("\\", "/")


def is_safe_zip_member(name: str) -> bool:
    normalized = normalize_zip_name(name)
    if not normalized or normalized.endswith("/"):
        return False
    path = PurePosixPath(normalized)
    if path.is_absolute():
        return False
    return ".." not in path.parts and "\x00" not in normalized


def safe_extract_zip(data: bytes, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(BytesIO(data)) as archive:
        for member in archive.infolist():
            name = normalize_zip_name(member.filename)
            if name.endswith("/"):
                continue
            if not is_safe_zip_member(name):
                raise ValueError(f"unsafe zip path: {name}")
            target = dest / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member, "r") as src, target.open("wb") as dst:
                dst.write(src.read())


def materialize_object(data: bytes, object_name: str, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    if object_name.lower().endswith(".zip"):
        safe_extract_zip(data, dest)
        return dest
    file_name = object_name.rsplit("/", 1)[-1] or "input.bin"
    target = dest / file_name
    target.write_bytes(data)
    return target


def prepare_workspace(client: Minio, bucket: str) -> Path:
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    SCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    model_path = env("MODEL_STORAGE_PATH")
    script_path = env("SCRIPT_STORAGE_PATH")
    input_mode = env("INPUT_MODE")
    dataset_path = env("DATASET_STORAGE_PATH")
    input_object = env("INPUT_OBJECT_NAME")

    materialize_object(download_object(client, bucket, model_path), model_path, MODEL_DIR)
    safe_extract_zip(download_object(client, bucket, script_path), SCRIPT_DIR)
    if input_mode == "DATASET_VERSION":
        return materialize_object(download_object(client, bucket, dataset_path), dataset_path, INPUT_DIR)
    return materialize_object(download_object(client, bucket, input_object), input_object, INPUT_DIR)


def callback(
    status: str,
    progress: int,
    result=None,
    error_message: str | None = None,
    log_path: str | None = None,
    output_path: str | None = None,
) -> None:
    url = env("BACKEND_CALLBACK_URL")
    token = env("INTERNAL_CALLBACK_TOKEN")
    if not url:
        log("BACKEND_CALLBACK_URL is empty, skip callback")
        return
    payload: dict = {"status": status, "progress": progress}
    if result is not None:
        payload["result"] = result
    if error_message:
        payload["errorMessage"] = error_message
    if log_path:
        payload["logPath"] = log_path
    if output_path:
        payload["outputPath"] = output_path
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "X-Internal-Token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            log(f"callback success: status={status}, http={response.status}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"callback failed HTTP {exc.code}: {body}") from exc


def upload_file(client: Minio, bucket: str, object_name: str, path: Path, content_type: str) -> str:
    client.fput_object(bucket, object_name, str(path), content_type=content_type)
    return object_name


def upload_outputs(client: Minio, bucket: str, task_id: str) -> tuple[str, str]:
    base = env("OUTPUT_OBJECT_PREFIX", f"inference-results/{task_id}").strip().strip("/")
    log_object = upload_file(client, bucket, f"{base}/infer.log", LOG_FILE, "text/plain")
    for path in OUTPUT_DIR.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(OUTPUT_DIR).as_posix()
        upload_file(client, bucket, f"{base}/outputs/{rel}", path, "application/octet-stream")
    return f"minio://{log_object}", f"minio://{base}/outputs/"


def read_result() -> dict:
    result_file = OUTPUT_DIR / "result.json"
    if not result_file.exists():
        return {}
    try:
        return json.loads(result_file.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"rawResultError": str(exc)}


def run_user_script(input_path: Path) -> None:
    entry_file = env("SCRIPT_ENTRY_FILE")
    entry_path = SCRIPT_DIR / entry_file
    if not entry_path.exists() or not entry_path.is_file():
        raise FileNotFoundError(f"entryFile not found: {entry_file}")
    child_env = os.environ.copy()
    child_env.update(
        {
            "MODEL_DIR": str(MODEL_DIR),
            "INPUT_PATH": str(input_path),
            "OUTPUT_DIR": str(OUTPUT_DIR),
            "PARAMS_JSON": env("PARAMS_JSON", "{}"),
            "TASK_ID": env("INFERENCE_TASK_ID"),
            "INPUT_MODE": env("INPUT_MODE"),
        }
    )
    command = [sys.executable, str(entry_path)]
    log(f"run inference script: {' '.join(command)}")
    completed = subprocess.run(
        command,
        cwd=str(SCRIPT_DIR),
        env=child_env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    with LOG_FILE.open("a", encoding="utf-8") as file:
        file.write(completed.stdout or "")
    if completed.returncode != 0:
        raise RuntimeError(f"inference script failed with exit code {completed.returncode}")


def main() -> int:
    task_id = env("INFERENCE_TASK_ID")
    client, bucket = minio_client()
    log_path = None
    output_path = None
    try:
        callback("running", 10)
        input_path = prepare_workspace(client, bucket)
        callback("running", 35)
        run_user_script(input_path)
        callback("running", 85)
        result = read_result()
        log_path, output_path = upload_outputs(client, bucket, task_id)
        callback("success", 100, result=result, log_path=log_path, output_path=output_path)
        return 0
    except Exception as exc:
        log(f"inference failed: {type(exc).__name__}: {exc}")
        try:
            if task_id:
                log_path, output_path = upload_outputs(client, bucket, task_id)
        except Exception as upload_exc:
            log(f"failed to upload failure artifacts: {upload_exc}")
        callback(
            "failed",
            0,
            error_message=f"{type(exc).__name__}: {exc}",
            log_path=log_path,
            output_path=output_path,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
