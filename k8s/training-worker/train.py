#!/usr/bin/env python3
"""TSS Platform 训练 Worker：按固定 trainingProfile 解压代码/数据 ZIP 并执行白名单命令。"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path, PurePosixPath

try:
    from minio import Minio
except ImportError:
    print("minio package not installed", file=sys.stderr)
    sys.exit(1)

# MLflow logging 通过 REST API 直写（与后端 MlflowTrackingService 一致），
# 不依赖 mlflow Python SDK，兼容平台 lite MLflow server（仅实现 REST 子集，无 artifact 存储）。

WORKSPACE = Path("/workspace/job")
MODEL_DIR = WORKSPACE / "model"

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

PROFILE_DISPLAY_NAMES = {
    "image_text_consistency_fusion_logreg": "图文一致性基线训练",
}

# 训练完成后从 metrics.json 读取并写入 MLflow 的指标键（统一前缀）
MLFLOW_METRIC_KEYS = [
    "accuracy",
    "precision",
    "recall",
    "f1",
    "roc_auc",
]
MLFLOW_METRIC_SPLITS = ["train", "val", "test"]


class MlflowLogger:
    """观测能力：通过 REST 记录 params/metrics/tags。任何异常只 warning，不阻断训练。

    平台 MLflow server 为 lite 实现，**不支持 artifact 存储**；
    训练产物（含 metrics.json/csv/train.log/fusion_model.pkl）仍以 MinIO 为主。
    """

    def __init__(self, training_id: str, profile_name: str):
        self.training_id = training_id
        self.profile_name = profile_name
        self.base_url = env("MLFLOW_TRACKING_URI", "").rstrip("/")
        self.experiment_name = env("MLFLOW_EXPERIMENT_NAME", "TSSAI-K8s-Training")
        self.enabled = bool(self.base_url)
        self.run_id: str | None = None
        self.experiment_id: str | None = None
        self.tracking_uri: str | None = None

    def start(self) -> None:
        if not self.enabled:
            log("MLflow 未启用（MLFLOW_TRACKING_URI 未设置），跳过 MLflow logging")
            return
        try:
            self.tracking_uri = self.base_url
            log(f"MLflow tracking URI: {self.tracking_uri}")
            log(f"MLflow experiment name: {self.experiment_name}")
            self.experiment_id = self._ensure_experiment()
            self.run_id = self._create_run()
            log(f"MLflow runId: {self.run_id}")
        except Exception as e:
            log(f"MLflow 启动失败，训练继续（不写 MLflow）: {e}")
            self.run_id = None

    def log_params(self, params: dict) -> None:
        if not self.run_id:
            return
        records = [{"key": k, "value": _truncate_param(v)} for k, v in params.items()]
        try:
            self._post("/api/2.0/mlflow/runs/log-batch", {"run_id": self.run_id, "params": records})
            log(f"MLflow log params: {list(params.keys())}")
        except Exception as e:
            log(f"MLflow log params 失败，训练继续: {e}")

    def log_metrics_from_file(self, metrics_path: Path) -> None:
        if not self.run_id or not metrics_path.exists():
            return
        try:
            raw = json.loads(metrics_path.read_text(encoding="utf-8"))
            records = []
            ts = _now_ms()
            for split in MLFLOW_METRIC_SPLITS:
                section = raw.get(split)
                if not isinstance(section, dict):
                    continue
                for key in MLFLOW_METRIC_KEYS:
                    value = section.get(key)
                    if isinstance(value, (int, float)):
                        records.append({"key": f"{split}_{key}", "value": float(value), "timestamp": ts, "step": 0})
            if records:
                self._post("/api/2.0/mlflow/runs/log-batch", {"run_id": self.run_id, "metrics": records})
                log(f"MLflow log metrics: {[r['key'] for r in records]}")
            else:
                log("MLflow 未从 metrics.json 解析到可记录指标")
        except Exception as e:
            log(f"MLflow log metrics 失败，训练继续: {e}")

    def log_artifacts(self, output_dir: Path, log_file: Path | None) -> None:
        # lite MLflow server 不支持 artifact 存储；产物以 MinIO 为主。
        if self.run_id:
            log("MLflow artifact 存储不支持（lite server），产物以 MinIO 为主")

    def finish(self, success: bool) -> None:
        if not self.run_id:
            return
        try:
            self._post("/api/2.0/mlflow/runs/update", {
                "run_id": self.run_id,
                "status": "FINISHED" if success else "FAILED",
                "end_time": _now_ms(),
            })
            log(f"MLflow end_run status={'FINISHED' if success else 'FAILED'}")
        except Exception as e:
            log(f"MLflow end_run 失败: {e}")

    def _ensure_experiment(self) -> str:
        # get-by-name
        try:
            resp = self._get(f"/api/2.0/mlflow/experiments/get-by-name?experiment_name={urllib.parse.quote(self.experiment_name)}")
            exp = resp.get("experiment")
            if exp and exp.get("experiment_id"):
                return str(exp["experiment_id"])
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
        # create
        resp = self._post("/api/2.0/mlflow/experiments/create", {"name": self.experiment_name})
        if not resp.get("experiment_id"):
            raise RuntimeError("MLflow 创建 experiment 未返回 experiment_id")
        return str(resp["experiment_id"])

    def _create_run(self) -> str:
        tags = [
            {"key": "mlflow.runName", "value": f"{self.training_id}-{self.profile_name}"},
            {"key": "tss.training_id", "value": self.training_id},
            {"key": "tss.training_profile", "value": self.profile_name},
            {"key": "tss.training_profile_display_name", "value": PROFILE_DISPLAY_NAMES.get(self.profile_name, self.profile_name)},
            {"key": "tss.code_version_id", "value": env("CODE_VERSION_ID")},
            {"key": "tss.dataset_version_id", "value": env("DATASET_VERSION_ID")},
        ]
        body = {
            "experiment_id": self.experiment_id,
            "start_time": _now_ms(),
            "tags": tags,
        }
        resp = self._post("/api/2.0/mlflow/runs/create", body)
        run = resp.get("run") or {}
        info = run.get("info") or {}
        if not info.get("run_id"):
            raise RuntimeError("MLflow 创建 run 未返回 run_id")
        return str(info["run_id"])

    def _get(self, path: str) -> dict:
        url = self.base_url + path
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _post(self, path: str, body: dict) -> dict:
        url = self.base_url + path
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))


def _now_ms() -> int:
    return int(time.time() * 1000)


def _truncate_param(value) -> str:
    if value is None:
        return ""
    return str(value)[:6000]


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
    mlflow_run_id=None,
    mlflow_experiment_id=None,
    mlflow_tracking_uri=None,
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
    if mlflow_run_id:
        payload["runId"] = mlflow_run_id
    if mlflow_experiment_id:
        payload["mlflowExperimentId"] = mlflow_experiment_id
    if mlflow_tracking_uri:
        payload["mlflowTrackingUri"] = mlflow_tracking_uri
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


def safe_extract_model_zip(data: bytes, dest: Path) -> None:
    """基础模型权重 ZIP：仅解压到 model/，不执行其中任何文件。"""
    blocked_ext = {".py", ".sh", ".bash", ".exe", ".bat", ".cmd", ".dll", ".so", ".jar"}
    allowed_ext = {
        ".pt", ".pth", ".onnx", ".pkl", ".joblib",
        ".yaml", ".yml", ".json", ".txt", ".md",
    }
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(BytesIO(data)) as zf:
        found_file = False
        for member in zf.infolist():
            name = normalize_zip_name(member.filename)
            if not is_safe_zip_member(name):
                raise ValueError(f"拒绝解压不安全路径: {name}")
            if name.endswith("/"):
                continue
            found_file = True
            ext = Path(name).suffix.lower()
            if not ext:
                raise ValueError(f"模型权重包包含无扩展名文件: {name}")
            if ext in blocked_ext:
                raise ValueError(f"模型权重包不允许脚本或可执行文件: {name}")
            if ext not in allowed_ext:
                raise ValueError(f"模型权重包包含不支持的文件类型: {name}")
            target = dest / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member, "r") as src, target.open("wb") as dst:
                dst.write(src.read())
            log(f"解压模型权重: {name}")
        if not found_file:
            raise ValueError("模型权重 zip 不能为空")


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


def run_profile_training(
    client: Minio,
    bucket: str,
    training_id: str,
    profile_name: str,
    mlflow_logger: MlflowLogger,
) -> None:
    profile = PROFILES.get(profile_name)
    if profile is None:
        raise ValueError(f"不支持的 trainingProfile: {profile_name}")

    code_path = env("CODE_STORAGE_PATH")
    dataset_path = env("DATASET_STORAGE_PATH")
    model_path = env("MODEL_STORAGE_PATH")
    base_model_version_id = env("BASE_MODEL_VERSION_ID")
    if not code_path or not dataset_path:
        raise ValueError("CODE_STORAGE_PATH 与 DATASET_STORAGE_PATH 均不能为空")
    if not model_path:
        raise ValueError("MODEL_STORAGE_PATH 不能为空")

    callback("running", 10)
    WORKSPACE.mkdir(parents=True, exist_ok=True)

    model_bytes = download_object(client, bucket, model_path)
    callback("running", 15)
    safe_extract_model_zip(model_bytes, MODEL_DIR)
    log(
        f"已下载基础模型权重 baseModelVersionId={base_model_version_id or env('MODEL_VERSION_ID')} "
        f"到 {MODEL_DIR}"
    )
    log(
        "当前训练方案 image_text_consistency_fusion_logreg 不自动加载基础模型权重"
    )

    code_bytes = download_object(client, bucket, code_path)
    dataset_bytes = download_object(client, bucket, dataset_path)
    callback("running", 25)

    safe_extract_zip(code_bytes, WORKSPACE)
    safe_extract_zip(dataset_bytes, WORKSPACE)
    callback("running", 40)

    command = profile["command"]
    if command[0].endswith(".sh"):
        raise ValueError("禁止执行 shell 脚本")

    # 启动 MLflow run 并记录 params（观测能力，失败不阻断训练）
    mlflow_logger.start()
    mlflow_logger.log_params({
        "trainingId": training_id,
        "trainingProfile": profile_name,
        "trainingProfileDisplayName": PROFILE_DISPLAY_NAMES.get(profile_name, profile_name),
        "codeVersionId": env("CODE_VERSION_ID"),
        "datasetVersionId": env("DATASET_VERSION_ID"),
        "baseModelVersionId": env("BASE_MODEL_VERSION_ID") or env("MODEL_VERSION_ID"),
        "modelStoragePath": model_path,
        "codeStoragePath": code_path,
        "datasetStoragePath": dataset_path,
        "hyperParams": env("HYPER_PARAMS_JSON"),
        "fixedCommand": " ".join(command),
    })

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

    # 写入 MLflow metrics（从 metrics.json 解析 train/val/test × accuracy/.../roc_auc）
    mlflow_logger.log_metrics_from_file(metrics_path)

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

    # MLflow artifact 存储由 lite server 限制，产物以 MinIO 为主；保留调用以记录日志说明。
    mlflow_logger.log_artifacts(output_dir, None)

    mlflow_logger.finish(success=True)

    callback(
        "success",
        100,
        metrics=metrics,
        log_path=f"minio://{log_object}",
        output_path=f"minio://{output_prefix}/",
        mlflow_run_id=mlflow_logger.run_id,
        mlflow_experiment_id=mlflow_logger.experiment_id,
        mlflow_tracking_uri=mlflow_logger.tracking_uri,
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
    mlflow_logger = MlflowLogger(training_id, profile_name)

    try:
        callback("running", 5)
        run_profile_training(client, bucket, training_id, profile_name, mlflow_logger)
        log("训练完成")
    except Exception as e:
        log(f"训练失败: {e}")
        mlflow_logger.finish(success=False)
        callback("failed", 0, error_message=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
