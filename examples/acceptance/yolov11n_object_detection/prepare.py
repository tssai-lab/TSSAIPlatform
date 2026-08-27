#!/usr/bin/env python3
"""Build a deterministic YOLO11n + COCO128 CPU acceptance bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


MODEL_URL = "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt"
MODEL_SHA256 = "0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1"
MODEL_LICENSE_URL = "https://raw.githubusercontent.com/ultralytics/ultralytics/v8.3.0/LICENSE"
MODEL_LICENSE_SHA256 = "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0"
COCO128_URL = "https://github.com/ultralytics/assets/releases/download/v0.0.0/coco128.zip"
COCO128_SHA256 = "61e5e3028863d8ffc3b81d6a514603954889f0edd5e4b44c4ce60b2da99aeb8e"
SPLIT_COUNTS = {"train": 96, "val": 16, "test": 16}
COCO_CLASSES = (
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
    "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
    "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
    "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork",
    "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli",
    "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant",
    "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard",
    "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book",
    "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_verified(url: str, destination: Path, expected_sha256: str) -> None:
    if destination.is_file() and sha256_file(destination) == expected_sha256:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".partial")
    partial.unlink(missing_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=60) as response, partial.open("wb") as target:
            shutil.copyfileobj(response, target, length=1024 * 1024)
        actual = sha256_file(partial)
        if actual != expected_sha256:
            raise RuntimeError(
                f"SHA-256 mismatch for {destination.name}: expected {expected_sha256}, got {actual}"
            )
        os.replace(partial, destination)
    finally:
        partial.unlink(missing_ok=True)


def deterministic_zip(output: Path, files: dict[str, bytes | Path]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".partial")
    temporary.unlink(missing_ok=True)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for archive_name in sorted(files):
                value = files[archive_name]
                data = value.read_bytes() if isinstance(value, Path) else value
                info = zipfile.ZipInfo(archive_name, date_time=(2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)


def _safe_source_name(name: str) -> PurePosixPath:
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise RuntimeError(f"unsafe COCO128 archive entry: {name}")
    return path


def read_coco128(archive_path: Path) -> tuple[dict[str, tuple[str, bytes]], dict[str, bytes], bytes, bytes]:
    images: dict[str, tuple[str, bytes]] = {}
    labels: dict[str, bytes] = {}
    with zipfile.ZipFile(archive_path) as archive:
        for info in archive.infolist():
            path = _safe_source_name(info.filename)
            if info.is_dir():
                continue
            suffix = path.suffix.lower()
            if len(path.parts) >= 3 and path.parts[-3:-1] == ("images", "train2017"):
                if suffix not in {".jpg", ".jpeg", ".png"}:
                    raise RuntimeError(f"unsupported COCO128 image: {info.filename}")
                if path.stem in images:
                    raise RuntimeError(f"duplicate COCO128 image stem: {path.stem}")
                images[path.stem] = (suffix, archive.read(info))
            elif len(path.parts) >= 3 and path.parts[-3:-1] == ("labels", "train2017"):
                if suffix != ".txt" or path.stem in labels:
                    raise RuntimeError(f"invalid COCO128 label entry: {info.filename}")
                labels[path.stem] = archive.read(info)
        upstream_license = archive.read("coco128/LICENSE")
        upstream_readme = archive.read("coco128/README.txt")
    if len(images) != 128:
        raise RuntimeError(f"COCO128 must contain 128 images, got {len(images)}")
    return images, labels, upstream_license, upstream_readme


def split_stems(stems: list[str]) -> dict[str, list[str]]:
    expected = sum(SPLIT_COUNTS.values())
    if len(stems) != expected or len(set(stems)) != expected:
        raise RuntimeError(f"COCO128 split requires {expected} unique image stems")
    ranked = sorted(stems, key=lambda stem: (hashlib.sha256(stem.encode()).hexdigest(), stem))
    result: dict[str, list[str]] = {}
    offset = 0
    for split, count in SPLIT_COUNTS.items():
        result[split] = ranked[offset:offset + count]
        offset += count
    return result


def data_yaml() -> bytes:
    lines = [
        "# Adapted from Ultralytics COCO128; deterministic non-overlapping 96/16/16 split.",
        "path: .",
        "train: images/train",
        "val: images/val",
        "test: images/test",
        "names:",
    ]
    lines.extend(f"  {index}: {name}" for index, name in enumerate(COCO_CLASSES))
    return ("\n".join(lines) + "\n").encode()


def build_dataset_zip(output: Path, source_archive: Path) -> dict[str, list[str]]:
    images, labels, _, _ = read_coco128(source_archive)
    splits = split_stems(list(images))
    files: dict[str, bytes | Path] = {"data.yaml": data_yaml()}
    for split, stems in splits.items():
        for stem in stems:
            suffix, image = images[stem]
            files[f"images/{split}/{stem}{suffix}"] = image
            # The source has two background images without matching labels and two
            # orphan labels without matching images. Empty labels preserve valid YOLO
            # background semantics while satisfying the platform's one-to-one contract.
            files[f"labels/{split}/{stem}.txt"] = labels.get(stem, b"")
    deterministic_zip(output, files)
    return splits


def validate_dataset_zip(path: Path) -> None:
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        if "data.yaml" not in names:
            raise RuntimeError("CV dataset has no data.yaml")
        for split, count in SPLIT_COUNTS.items():
            images = sorted(name for name in names if name.startswith(f"images/{split}/"))
            labels = sorted(name for name in names if name.startswith(f"labels/{split}/"))
            if len(images) != count or len(labels) != count:
                raise RuntimeError(f"CV dataset split {split} has an unexpected item count")
            if {Path(name).stem for name in images} != {Path(name).stem for name in labels}:
                raise RuntimeError(f"CV dataset split {split} has unmatched images or labels")
            for label_name in labels:
                for line_number, raw in enumerate(archive.read(label_name).decode().splitlines(), start=1):
                    if not raw.strip():
                        continue
                    columns = raw.split()
                    if len(columns) != 5 or not columns[0].isdigit():
                        raise RuntimeError(f"invalid YOLO label at {label_name}:{line_number}")
                    if int(columns[0]) >= len(COCO_CLASSES):
                        raise RuntimeError(f"unknown YOLO class at {label_name}:{line_number}")
                    if any(not 0 <= float(value) <= 1 for value in columns[1:]):
                        raise RuntimeError(f"out-of-range YOLO label at {label_name}:{line_number}")


def source_notice() -> bytes:
    return (
        "# COCO128 source and adaptation notice\n\n"
        f"- Official archive: {COCO128_URL}\n"
        f"- Archive SHA-256: `{COCO128_SHA256}`\n"
        "- Contents: first 128 images from COCO train2017 with YOLO-format labels.\n"
        "- Adaptation: images are deterministically split into 96 train, 16 validation, "
        "and 16 test images. Two source background images receive empty YOLO label files; "
        "two source orphan label files without matching images are omitted. Image pixels and "
        "non-empty annotations are otherwise unchanged.\n"
        "- Attribution: COCO Consortium and Ultralytics. Cite the COCO paper identified in "
        "the package README.\n"
        "- Licensing: the upstream archive's LICENSE and README are included beside this file. "
        "COCO source images can retain source-specific terms; users must preserve attribution "
        "and the supplied notices.\n"
    ).encode()


def build_bundle(output_dir: Path, cache: Path, repository_root: Path) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    weight = cache / "yolo11n.pt"
    model_license = cache / "ULTRALYTICS_LICENSE.txt"
    coco_archive = cache / "coco128.zip"
    download_verified(MODEL_URL, weight, MODEL_SHA256)
    download_verified(MODEL_LICENSE_URL, model_license, MODEL_LICENSE_SHA256)
    download_verified(COCO128_URL, coco_archive, COCO128_SHA256)

    source_dir = Path(__file__).resolve().parent
    deterministic_zip(
        output_dir / "yolo11n-base-model.zip",
        {
            "MODEL_SOURCE.md": (
                "# YOLO11n model source\n\n"
                f"- URL: {MODEL_URL}\n"
                f"- SHA-256: {MODEL_SHA256}\n"
                "- Upstream release: Ultralytics assets v8.3.0\n"
                "- License: AGPL-3.0 or separately obtained Ultralytics commercial license\n"
            ).encode(),
            "ULTRALYTICS_LICENSE.txt": model_license,
            "yolo11n.pt": weight,
        },
    )
    dataset_path = output_dir / "yolo11n-coco128-dataset.zip"
    splits = build_dataset_zip(dataset_path, coco_archive)
    validate_dataset_zip(dataset_path)
    _, _, upstream_license, upstream_readme = read_coco128(coco_archive)
    (output_dir / "COCO128_SOURCE_AND_LICENSE.md").write_bytes(source_notice())
    (output_dir / "COCO128_UPSTREAM_LICENSE.txt").write_bytes(upstream_license)
    (output_dir / "COCO128_UPSTREAM_README.txt").write_bytes(upstream_readme)
    deterministic_zip(
        output_dir / "yolo11n-training-code.zip",
        {
            "requirements.txt": repository_root / "examples/training/yolo_object_detection/requirements.txt",
            "train.py": repository_root / "examples/training/yolo_object_detection/train.py",
        },
    )
    deterministic_zip(
        output_dir / "yolo11n-inference-script.zip",
        {"infer.py": repository_root / "examples/inference/yolov11n/infer.py"},
    )
    shutil.copy2(source_dir / "yolov11n_object_detection_cpu-v1.yaml", output_dir)
    shutil.copy2(source_dir / "README.md", output_dir)

    artifacts = []
    for path in sorted(output_dir.iterdir()):
        if path.is_file() and path.name != "acceptance-manifest.json":
            artifacts.append(
                {"file": path.name, "sizeBytes": path.stat().st_size, "sha256": sha256_file(path)}
            )
    manifest: dict[str, object] = {
        "schemaVersion": "tss.acceptance.bundle/v1",
        "name": "YOLO11n COCO128 object detection CPU acceptance",
        "upstream": {
            "modelUrl": MODEL_URL,
            "modelSha256": MODEL_SHA256,
            "modelLicense": "AGPL-3.0 or Ultralytics commercial license",
            "datasetUrl": COCO128_URL,
            "datasetArchiveSha256": COCO128_SHA256,
        },
        "dataset": {
            "name": "COCO128",
            "adaptation": "deterministic non-overlapping split; empty labels added for two backgrounds; two orphan labels omitted",
            "classCount": len(COCO_CLASSES),
            "splits": {name: len(stems) for name, stems in splits.items()},
        },
        "artifacts": artifacts,
    }
    (output_dir / "acceptance-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("dist/yolov11n-cpu-acceptance"))
    parser.add_argument("--cache-dir", type=Path, default=Path(".cache/yolov11n-coco128"))
    args = parser.parse_args()
    repository_root = Path(__file__).resolve().parents[3]
    manifest = build_bundle(args.output_dir.resolve(), args.cache_dir.resolve(), repository_root)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
