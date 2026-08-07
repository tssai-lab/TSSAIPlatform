#!/usr/bin/env python3
"""Reference entrypoint for the yolo_object_detection TrainingPlan.

The platform places model/data/code/output in fixed directories and passes every
user parameter through params.json. This script emits the documented TSS_EVENT
lines and produces the artifacts declared in yolo_object_detection-v1.yaml.

进度 / 指标事件协议（重要）：
- 平台会逐行读取本脚本的 stdout，识别以 "TSS_EVENT " 开头、后面跟合法 JSON 的行。
- progress 必须是 0~100 的数值（完成度百分比，不是 epoch 数）。
- 必须 flush（print 加 flush=True），否则 stdout 缓冲会导致事件延迟/丢失，进度条看起来卡住。
- 每次打印必须独占一行，行首必须是 "TSS_EVENT "。
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
from pathlib import Path

from ultralytics import YOLO


def event(payload: dict) -> None:
    """向平台上报一条 TSS_EVENT 事件（进度 / 指标），打印后立即 flush。"""
    print("TSS_EVENT " + json.dumps(payload, ensure_ascii=False), flush=True)


def on_epoch_end(trainer) -> None:
    """每个 epoch 结束时上报进度和当前指标，让训练进度条与指标曲线动起来。"""
    epoch = int(getattr(trainer, "epoch", 0) + 1)
    total = int(getattr(trainer, "epochs", 1) or 1)
    pct = max(0, min(100, round(epoch * 100.0 / total)))
    event({"type": "progress", "progress": pct})
    metrics = getattr(trainer, "metrics", None) or {}
    snapshot = {}
    for source, target in (
        ("train/box_loss", "train_loss"),
        ("metrics/mAP50(B)", "val_mAP50"),
        ("metrics/mAP50-95(B)", "val_mAP50_95"),
        ("metrics/precision(B)", "val_precision"),
        ("metrics/recall(B)", "val_recall"),
    ):
        value = metrics.get(source)
        if isinstance(value, (int, float)):
            snapshot[target] = value
    if snapshot:
        event({"type": "metric", "metrics": snapshot})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--params-file", required=True)
    parser.add_argument("--device", default="0")
    args = parser.parse_args()

    params = json.loads(Path(args.params_file).read_text(encoding="utf-8"))
    mode = os.environ.get("TSS_TRAINING_MODE", "FULL_FINETUNE")
    model_path = Path(args.model_dir) / "yolo11n.pt"
    data_yaml = Path(args.data_dir) / "data.yaml"
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    if not data_yaml.is_file():
        raise FileNotFoundError(f"missing required dataset manifest: {data_yaml}")
    if mode != "FROM_SCRATCH" and not model_path.is_file():
        raise FileNotFoundError(f"missing required base model: {model_path}")

    event({"type": "progress", "progress": 2})
    model = YOLO(str(model_path) if mode != "FROM_SCRATCH" else "yolo11n.yaml")
    # 注册 epoch 结束回调：训练过程中自动上报进度 + 指标
    model.add_callback("on_train_epoch_end", on_epoch_end)
    event({"type": "progress", "progress": 8})
    result = model.train(
        data=str(data_yaml),
        epochs=int(params.get("epochs", 3)),
        batch=int(params.get("batch", 4)),
        imgsz=int(params.get("imgsz", 640)),
        lr0=float(params.get("learningRate", 0.001)),
        device=args.device,
        project=str(output / "ultralytics"),
        name="run",
        exist_ok=True,
        verbose=True,
    )
    event({"type": "progress", "progress": 90})
    run_dir = Path(result.save_dir)
    shutil.copy2(run_dir / "weights" / "best.pt", output / "best.pt")
    shutil.copy2(run_dir / "weights" / "last.pt", output / "last.pt")
    metrics = {"trainingMode": mode, "epochs": int(params.get("epochs", 3))}
    results_csv = run_dir / "results.csv"
    if results_csv.is_file():
        metrics["resultsCsv"] = str(results_csv.name)
        with results_csv.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        if rows:
            latest = rows[-1]

            def column(name: str):
                raw = latest.get(name)
                try:
                    return float(raw) if raw not in (None, "") else None
                except (TypeError, ValueError):
                    return None

            # 用 Ultralytics results.csv 的末行指标，转成平台可视化的标准指标名
            metrics["train_loss"] = column("train/box_loss")
            metrics["val_mAP50"] = column("metrics/mAP50(B)")
            metrics["val_mAP50_95"] = column("metrics/mAP50-95(B)")
            metrics["val_precision"] = column("metrics/precision(B)")
            metrics["val_recall"] = column("metrics/recall(B)")
            for key in ("train_loss", "val_mAP50", "val_mAP50_95", "val_precision", "val_recall"):
                if metrics.get(key) is None:
                    metrics.pop(key, None)
    (output / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    event({"type": "metric", "metrics": metrics})
    event({"type": "progress", "progress": 100})


if __name__ == "__main__":
    main()
