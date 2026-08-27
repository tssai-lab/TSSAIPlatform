#!/usr/bin/env python3
"""Build the offline MiniRBT-H288 + MASSIVE zh-CN CPU acceptance bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tarfile
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path, PurePosixPath


MODEL_REPOSITORY = "hfl/minirbt-h288"
MODEL_REVISION = "dc4eebb0cf6f9e7094142ac28fbf971517c6a366"
MODEL_LICENSE_REPOSITORY = "iflytek/MiniRBT"
MODEL_LICENSE_REVISION = "baef787a1cee4fdc4051083943a460807e7b8a86"
UPSTREAM_FILES = {
    "README.md": "667be60e0b89d63d308d3d1e76f906d056ad4a2c56e6a2f785544098e220f3eb",
    "config.json": "40770b75151e7633503a0c70a25291cb62431ed89f8a091576f0b7526011eeb4",
    "pytorch_model.bin": "691a14f646648bbf772dd0054c78c1a5451e09bc76bc3bdf874bd42bf5ee55b1",
    "vocab.txt": "45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c",
}
MODEL_LICENSE_SHA256 = "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4"

MASSIVE_VERSION = "1.1"
MASSIVE_URL = "https://amazon-massive-nlu-dataset.s3.amazonaws.com/amazon-massive-dataset-1.1.tar.gz"
MASSIVE_SHA256 = "4cba5faa11c71437928e17cb1b9b3d8b8e727e7ea363a3a9a8045e19c0491577"
MASSIVE_NOTICE_URL = "https://raw.githubusercontent.com/alexa/massive/main/NOTICE.md"
MASSIVE_NOTICE_SHA256 = "db1466b051afd1d9ad34b7bd6346a1857f568a0c5f6534168813b4ad3c26013e"
CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/legalcode.txt"
CC_BY_SHA256 = "9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411"
SELECTED_INTENTS = (
    "alarm_set",
    "weather_query",
    "play_music",
    "news_query",
    "calendar_set",
    "transport_taxi",
)
SOURCE_SPLIT_COUNTS = {"train": 24, "dev": 8, "test": 8}
OUTPUT_SPLITS = {"train": "train", "dev": "validation", "test": "test"}


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


def _read_regular_tar_member(archive: tarfile.TarFile, name: str) -> bytes:
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise RuntimeError(f"unsafe MASSIVE archive member: {name}")
    member = archive.getmember(name)
    if not member.isfile() or member.issym() or member.islnk():
        raise RuntimeError(f"MASSIVE archive member is not a regular file: {name}")
    source = archive.extractfile(member)
    if source is None:
        raise RuntimeError(f"cannot read MASSIVE archive member: {name}")
    return source.read()


def read_massive_source(archive_path: Path) -> tuple[list[dict[str, object]], bytes, bytes]:
    with tarfile.open(archive_path, "r:gz") as archive:
        raw_rows = _read_regular_tar_member(archive, "1.1/data/zh-CN.jsonl")
        citation = _read_regular_tar_member(archive, "1.1/CITATION.md")
        archive_notice = _read_regular_tar_member(archive, "1.1/NOTICE.md")
    rows: list[dict[str, object]] = []
    for line_number, raw in enumerate(raw_rows.decode("utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise RuntimeError(f"MASSIVE zh-CN line {line_number} is not an object")
        if value.get("locale") != "zh-CN":
            raise RuntimeError(f"MASSIVE zh-CN line {line_number} has wrong locale")
        rows.append(value)
    if len(rows) != 16521:
        raise RuntimeError(f"MASSIVE zh-CN v1.1 must contain 16521 rows, got {len(rows)}")
    return rows, citation, archive_notice


def _source_id_key(record: dict[str, object]) -> tuple[int, int | str]:
    raw = str(record.get("id", ""))
    return (0, int(raw)) if raw.isdigit() else (1, raw)


def select_massive_subset(rows: list[dict[str, object]]) -> dict[str, list[dict[str, str]]]:
    grouped: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        partition = str(row.get("partition", ""))
        intent = str(row.get("intent", ""))
        if partition in SOURCE_SPLIT_COUNTS and intent in SELECTED_INTENTS:
            grouped[(partition, intent)].append(row)

    output: dict[str, list[dict[str, str]]] = {name: [] for name in OUTPUT_SPLITS.values()}
    for source_split, per_class in SOURCE_SPLIT_COUNTS.items():
        target_split = OUTPUT_SPLITS[source_split]
        for intent in SELECTED_INTENTS:
            candidates = sorted(grouped[(source_split, intent)], key=_source_id_key)
            if len(candidates) < per_class:
                raise RuntimeError(
                    f"MASSIVE {source_split}/{intent} has {len(candidates)} rows; need {per_class}"
                )
            for source in candidates[:per_class]:
                source_id = str(source.get("id", "")).strip()
                text = str(source.get("utt", "")).strip()
                if not source_id or not text:
                    raise RuntimeError(f"MASSIVE {source_split}/{intent} contains an empty id or utterance")
                output[target_split].append(
                    {
                        "id": f"massive-zh-CN-{source_split}-{source_id}",
                        "text": text,
                        "label": intent,
                    }
                )
    for records in output.values():
        records.sort(key=lambda record: (record["label"], record["id"]))
    all_ids = [record["id"] for records in output.values() for record in records]
    if len(all_ids) != len(set(all_ids)):
        raise RuntimeError("MASSIVE subset contains duplicate IDs")
    return output


def jsonl_bytes(records: list[dict[str, str]]) -> bytes:
    return "".join(
        json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"
        for record in records
    ).encode("utf-8")


def dataset_source_notice() -> bytes:
    return (
        "MASSIVE zh-CN v1.1 fixed CPU acceptance subset\n\n"
        f"Official archive: {MASSIVE_URL}\n"
        f"Archive SHA-256: {MASSIVE_SHA256}\n"
        "Locale: zh-CN\n"
        f"Selected intents: {', '.join(SELECTED_INTENTS)}\n"
        "Selection: for each intent, sort official source IDs ascending and take the first "
        "24 train, 8 dev and 8 test records. Source dev is renamed validation. Text and intent "
        "labels are unchanged; only field names and packaging are adapted.\n"
        "License: CC BY 4.0. Preserve attribution, license, change notice and citation.\n"
    ).encode("utf-8")


def build_dataset_zip(
    output: Path,
    massive_archive: Path,
    official_notice: Path,
    cc_by_license: Path,
) -> dict[str, list[dict[str, str]]]:
    rows, citation, archive_notice = read_massive_source(massive_archive)
    splits = select_massive_subset(rows)
    manifest = {
        "schemaVersion": "tss.dataset.nlp.text-classification/v1",
        "name": "MASSIVE zh-CN v1.1 fixed intent-classification subset",
        "labels": list(SELECTED_INTENTS),
        "fields": {"id": "id", "text": "text", "label": "label"},
        "splits": {name: len(records) for name, records in splits.items()},
        "source": {
            "dataset": "MASSIVE",
            "version": MASSIVE_VERSION,
            "locale": "zh-CN",
            "archiveUrl": MASSIVE_URL,
            "archiveSha256": MASSIVE_SHA256,
        },
        "adaptation": "six-intent stratified fixed subset; official dev renamed validation",
        "license": "CC BY 4.0",
    }
    deterministic_zip(
        output,
        {
            "CC-BY-4.0.txt": cc_by_license,
            "MASSIVE_ARCHIVE_NOTICE.txt": archive_notice,
            "MASSIVE_CITATION.txt": citation,
            "MASSIVE_NOTICE.txt": official_notice,
            "SOURCE_AND_CHANGES.txt": dataset_source_notice(),
            "dataset.json": json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
            "data/train.jsonl": jsonl_bytes(splits["train"]),
            "data/validation.jsonl": jsonl_bytes(splits["validation"]),
            "data/test.jsonl": jsonl_bytes(splits["test"]),
        },
    )
    return splits


def build_model_zip(output: Path, cache: Path) -> None:
    for name, expected in UPSTREAM_FILES.items():
        download_verified(
            f"https://huggingface.co/{MODEL_REPOSITORY}/resolve/{MODEL_REVISION}/{name}",
            cache / name,
            expected,
        )
    download_verified(
        f"https://raw.githubusercontent.com/{MODEL_LICENSE_REPOSITORY}/{MODEL_LICENSE_REVISION}/LICENSE",
        cache / "LICENSE",
        MODEL_LICENSE_SHA256,
    )
    model_manifest = (
        "schemaVersion: tss.model.nlp.bert-sequence-classification/v1\n"
        "baseModel: hfl/minirbt-h288\n"
        f"revision: {MODEL_REVISION}\n"
        "architecture: BertModel\n"
        "purpose: sequence-classification-finetune\n"
        "license: Apache-2.0\n"
    ).encode("utf-8")
    deterministic_zip(
        output,
        {
            "LICENSE.txt": cache / "LICENSE",
            "UPSTREAM_README.md": cache / "README.md",
            "config.json": cache / "config.json",
            "model.yaml": model_manifest,
            "pytorch_model.bin": cache / "pytorch_model.bin",
            "vocab.txt": cache / "vocab.txt",
        },
    )


def build_bundle(
    output_dir: Path,
    model_cache: Path,
    dataset_cache: Path,
    source_dir: Path,
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    massive_archive = dataset_cache / "amazon-massive-dataset-1.1.tar.gz"
    official_notice = dataset_cache / "MASSIVE_NOTICE.md"
    cc_by_license = dataset_cache / "CC-BY-4.0.txt"
    download_verified(MASSIVE_URL, massive_archive, MASSIVE_SHA256)
    download_verified(MASSIVE_NOTICE_URL, official_notice, MASSIVE_NOTICE_SHA256)
    download_verified(CC_BY_URL, cc_by_license, CC_BY_SHA256)

    build_model_zip(output_dir / "minirbt-h288-base.zip", model_cache)
    splits = build_dataset_zip(
        output_dir / "massive-zhcn-intent-dataset.zip",
        massive_archive,
        official_notice,
        cc_by_license,
    )
    deterministic_zip(output_dir / "minirbt-training-code.zip", {"train.py": source_dir / "train.py"})
    deterministic_zip(output_dir / "minirbt-inference-script.zip", {"infer.py": source_dir / "infer.py"})
    repository_root = source_dir.parents[2]
    shutil.copy2(source_dir / "README.md", output_dir)
    shutil.copy2(
        repository_root / "backend/src/main/resources/training-plans/minirbt_text_classification-v1.yaml",
        output_dir,
    )
    artifacts = []
    for path in sorted(output_dir.iterdir()):
        if path.is_file() and path.name != "acceptance-manifest.json":
            artifacts.append(
                {"file": path.name, "sizeBytes": path.stat().st_size, "sha256": sha256_file(path)}
            )
    manifest = {
        "schemaVersion": "tss.acceptance.bundle/v1",
        "name": "MiniRBT-H288 MASSIVE zh-CN intent classification CPU acceptance",
        "upstream": {
            "model": MODEL_REPOSITORY,
            "modelRevision": MODEL_REVISION,
            "modelLicense": "Apache-2.0",
            "dataset": "MASSIVE",
            "datasetVersion": MASSIVE_VERSION,
            "datasetArchiveSha256": MASSIVE_SHA256,
            "datasetLicense": "CC BY 4.0",
        },
        "dataset": {
            "locale": "zh-CN",
            "intents": list(SELECTED_INTENTS),
            "splits": {name: len(records) for name, records in splits.items()},
        },
        "artifacts": artifacts,
    }
    (output_dir / "acceptance-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("dist/minirbt-massive-acceptance"))
    parser.add_argument("--model-cache-dir", type=Path, default=Path(".cache/minirbt-h288"))
    parser.add_argument("--dataset-cache-dir", type=Path, default=Path(".cache/massive-v1.1"))
    args = parser.parse_args()
    source_dir = Path(__file__).resolve().parent
    manifest = build_bundle(
        args.output_dir.resolve(),
        args.model_cache_dir.resolve(),
        args.dataset_cache_dir.resolve(),
        source_dir,
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
