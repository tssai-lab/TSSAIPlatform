#!/usr/bin/env python3
"""Reference entrypoint for the yolo_object_detection TrainingPlan.

The platform places model/data/code/output in fixed directories and passes every
user parameter through params.json. This script emits the documented TSS_EVENT
lines and produces the artifacts declared in yolo_object_detection-v1.yaml.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from ultralytics import YOLO


def event(payload: dict) -> None:
    print("TSS_EVENT " + json.dumps(payload, ensure_ascii=False), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--params-file", required=True)
    parser.add_argument("--device", default="0")
    args = parser.parse_args()

    params = json.loads(Path(args.params_file).read_text(encoding="utf-8"))
    mode = __import__("os").environ.get("TSS_TRAINING_MODE", "FULL_FINETUNE")
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
    metrics = {"trainingMode": mode, "epochs": params.get("epochs", 3)}
    results_csv = run_dir / "results.csv"
    if results_csv.is_file():
        metrics["resultsCsv"] = str(results_csv.name)
    (output / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    event({"type": "metric", "metrics": metrics})
    event({"type": "progress", "progress": 100})


if __name__ == "__main__":
    main()
