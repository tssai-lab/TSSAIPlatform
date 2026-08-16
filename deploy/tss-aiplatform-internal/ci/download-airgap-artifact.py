#!/usr/bin/env python3
"""Download one trusted GitHub Actions artifact with parallel range requests."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
import time
from typing import Any
import urllib.error
import urllib.request
import zipfile


EXPECTED_FILES = {
    "airgap-common.sha256",
    "airgap-gpu.sha256",
    "calico-amd64.tar",
    "k8s-core-amd64.tar",
    "nvidia-amd64.tar",
    "sources.lock",
}
USER_AGENT = "tss-aiplatform-airgap/1.0"


def fail(message: str) -> "NoReturn":
    raise RuntimeError(message)


def api_request(url: str, token: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


def api_json(url: str, token: str) -> dict[str, Any]:
    with urllib.request.urlopen(api_request(url, token), timeout=30) as response:
        return json.load(response)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def signed_archive_url(repository: str, artifact_id: int, token: str) -> str:
    url = f"https://api.github.com/repos/{repository}/actions/artifacts/{artifact_id}/zip"
    opener = urllib.request.build_opener(NoRedirect)
    try:
        opener.open(api_request(url, token), timeout=30)
    except urllib.error.HTTPError as error:
        if error.code not in {302, 307}:
            raise
        location = error.headers.get("Location", "")
        if not location.startswith("https://"):
            fail("artifact API returned an invalid redirect")
        return location
    fail("artifact API did not return a download redirect")


def trusted_artifact(
    repository: str, run_id: int, head_sha: str, token: str
) -> tuple[int, int, str]:
    payload = api_json(
        f"https://api.github.com/repos/{repository}/actions/runs/{run_id}/artifacts?per_page=100",
        token,
    )
    expected_name = f"tss-aiplatform-airgap-{head_sha}"
    matches = [
        artifact
        for artifact in payload.get("artifacts", [])
        if artifact.get("name") == expected_name
    ]
    if len(matches) != 1:
        fail("the export run must contain exactly one expected air-gap artifact")
    artifact = matches[0]
    if artifact.get("expired") is not False:
        fail("the expected air-gap artifact is expired")
    artifact_id = artifact.get("id")
    size = artifact.get("size_in_bytes")
    digest = artifact.get("digest", "")
    if not isinstance(artifact_id, int) or artifact_id <= 0:
        fail("artifact ID is invalid")
    if not isinstance(size, int) or size <= 0 or size > 4 * 1024**3:
        fail("artifact size is invalid or exceeds the 4 GiB safety limit")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        fail("artifact has no valid GitHub SHA256 digest")
    return artifact_id, size, digest.removeprefix("sha256:")


def probe_archive_size(url: str) -> int:
    request = urllib.request.Request(
        url,
        headers={"Range": "bytes=0-0", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        content_range = response.headers.get("Content-Range", "")
        body = response.read()
        status_code = response.getcode()
    match = re.fullmatch(r"bytes 0-0/([1-9][0-9]*)", content_range)
    if status_code != 206 or body == b"" or not match:
        fail("artifact storage does not support strict byte-range downloads")
    return int(match.group(1))


def download_part(
    *,
    part_number: int,
    start: int,
    end: int,
    archive_size: int,
    initial_url: str,
    part_path: Path,
    repository: str,
    artifact_id: int,
    token: str,
) -> tuple[int, int]:
    expected_size = end - start + 1
    for attempt in range(1, 6):
        temporary_path = part_path.with_suffix(part_path.suffix + ".download")
        temporary_path.unlink(missing_ok=True)
        url = initial_url if attempt == 1 else signed_archive_url(repository, artifact_id, token)
        request = urllib.request.Request(
            url,
            headers={
                "Range": f"bytes={start}-{end}",
                "User-Agent": USER_AGENT,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                content_range = response.headers.get("Content-Range", "")
                if response.getcode() != 206:
                    fail(f"part {part_number} was not returned as HTTP 206")
                if content_range != f"bytes {start}-{end}/{archive_size}":
                    fail(f"part {part_number} returned an unexpected content range")
                written = 0
                with temporary_path.open("xb") as output_file:
                    while True:
                        block = response.read(1024 * 1024)
                        if not block:
                            break
                        output_file.write(block)
                        written += len(block)
            if written != expected_size:
                fail(
                    f"part {part_number} size mismatch: expected={expected_size} actual={written}"
                )
            temporary_path.replace(part_path)
            return part_number, written
        except Exception:
            temporary_path.unlink(missing_ok=True)
            if attempt == 5:
                raise
            time.sleep(min(2**attempt, 16))
    fail(f"part {part_number} exhausted its retries")


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        while block := input_file.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def validate_checksum_file(extract_dir: Path, checksum_name: str, expected_names: list[str]) -> None:
    checksum_path = extract_dir / checksum_name
    lines = checksum_path.read_text(encoding="utf-8").splitlines()
    parsed_names: list[str] = []
    parsed: list[tuple[str, str]] = []
    for line in lines:
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9._-]+)", line)
        if not match:
            fail(f"invalid checksum entry in {checksum_name}")
        parsed.append((match.group(1), match.group(2)))
        parsed_names.append(match.group(2))
    if parsed_names != expected_names:
        fail(f"unexpected paths or order in {checksum_name}")
    for expected_digest, name in parsed:
        if hash_file(extract_dir / name) != expected_digest:
            fail(f"bundle checksum mismatch: {name}")


def extract_verified_archive(archive_path: Path, extract_dir: Path) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        infos = archive.infolist()
        names = [info.filename for info in infos]
        if len(names) != len(EXPECTED_FILES) or set(names) != EXPECTED_FILES:
            fail("artifact archive does not contain exactly the six expected files")
        if len(names) != len(set(names)):
            fail("artifact archive contains duplicate paths")
        total_size = 0
        for info in infos:
            if info.is_dir() or Path(info.filename).name != info.filename:
                fail("artifact archive contains a directory or unsafe path")
            file_type = (info.external_attr >> 16) & 0o170000
            if file_type == stat.S_IFLNK:
                fail("artifact archive contains a symbolic link")
            total_size += info.file_size
        if total_size <= 0 or total_size > 4 * 1024**3:
            fail("artifact extracted size is invalid or exceeds the safety limit")

        extract_dir.mkdir(mode=0o700)
        for info in infos:
            destination = extract_dir / info.filename
            with archive.open(info, "r") as source, destination.open("xb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
            os.chmod(destination, 0o640)

    validate_checksum_file(
        extract_dir,
        "airgap-common.sha256",
        ["k8s-core-amd64.tar", "calico-amd64.tar", "sources.lock"],
    )
    validate_checksum_file(
        extract_dir,
        "airgap-gpu.sha256",
        ["nvidia-amd64.tar"],
    )


def safe_stage_root(stage_root: str) -> Path:
    configured = Path(stage_root)
    if not configured.is_absolute() or configured.is_symlink():
        fail("stage root must be an absolute real directory")
    resolved = configured.resolve(strict=True)
    if resolved != configured or not resolved.is_dir():
        fail("stage root must already be normalized and present")
    if resolved.stat().st_uid != os.getuid():
        fail("stage root must be owned by the Runner user")
    if resolved.stat().st_mode & 0o022:
        fail("stage root must not be writable by group or other users")
    return resolved


def run_download(args: argparse.Namespace) -> None:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repository):
        fail("repository must be owner/name")
    if not re.fullmatch(r"[0-9a-f]{40}", args.head_sha):
        fail("head SHA must contain exactly 40 lowercase hexadecimal characters")
    if args.run_id <= 0 or not 2 <= args.workers <= 32:
        fail("run ID or worker count is outside the accepted range")
    token = os.environ.get("GH_TOKEN", "")
    if not token:
        fail("GH_TOKEN is required")
    stage_root = safe_stage_root(args.stage_root)
    target_dir = stage_root / f"{args.head_sha}-{args.run_id}"
    partial_dir = stage_root / f".partial-{args.head_sha}-{args.run_id}"
    for path in (target_dir, partial_dir):
        if path.exists() or path.is_symlink():
            fail(f"staging path already exists: {path}")
    partial_dir.mkdir(mode=0o700)

    artifact_id, metadata_size, expected_digest = trusted_artifact(
        args.repository, args.run_id, args.head_sha, token
    )
    initial_url = signed_archive_url(args.repository, artifact_id, token)
    archive_size = probe_archive_size(initial_url)
    if archive_size != metadata_size:
        fail(
            f"artifact size differs between metadata and storage: {metadata_size} != {archive_size}"
        )

    part_count = min(args.workers, archive_size)
    part_size = math.ceil(archive_size / part_count)
    tasks = []
    for part_number in range(part_count):
        start = part_number * part_size
        end = min(start + part_size, archive_size) - 1
        tasks.append((part_number, start, end, partial_dir / f"part-{part_number:03d}"))

    print(
        f"Downloading artifact={artifact_id} bytes={archive_size} parts={part_count}",
        flush=True,
    )
    with concurrent.futures.ThreadPoolExecutor(max_workers=part_count) as executor:
        futures = [
            executor.submit(
                download_part,
                part_number=part_number,
                start=start,
                end=end,
                archive_size=archive_size,
                initial_url=initial_url,
                part_path=part_path,
                repository=args.repository,
                artifact_id=artifact_id,
                token=token,
            )
            for part_number, start, end, part_path in tasks
        ]
        for future in concurrent.futures.as_completed(futures):
            part_number, byte_count = future.result()
            print(f"Downloaded part={part_number + 1}/{part_count} bytes={byte_count}", flush=True)

    archive_path = partial_dir / "artifact.zip"
    archive_digest = hashlib.sha256()
    combined_size = 0
    with archive_path.open("xb") as archive_file:
        for _, _, _, part_path in tasks:
            with part_path.open("rb") as part_file:
                while block := part_file.read(1024 * 1024):
                    archive_file.write(block)
                    archive_digest.update(block)
                    combined_size += len(block)
    if combined_size != archive_size:
        fail("combined artifact size does not match GitHub metadata")
    if archive_digest.hexdigest() != expected_digest:
        fail("combined artifact SHA256 does not match the GitHub artifact digest")

    extracted_dir = partial_dir / "extracted"
    extract_verified_archive(archive_path, extracted_dir)
    extracted_dir.replace(target_dir)
    shutil.rmtree(partial_dir)
    print(
        f"Parallel artifact staging complete: artifact={artifact_id} "
        f"digest=sha256:{expected_digest} target={target_dir}",
        flush=True,
    )


def self_test() -> None:
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        content = {
            "k8s-core-amd64.tar": b"core",
            "calico-amd64.tar": b"calico",
            "nvidia-amd64.tar": b"nvidia",
            "sources.lock": b"image example.invalid/test:v1 sha256:" + b"0" * 64 + b"\n",
        }
        common_names = ["k8s-core-amd64.tar", "calico-amd64.tar", "sources.lock"]
        content["airgap-common.sha256"] = "".join(
            f"{hashlib.sha256(content[name]).hexdigest()}  {name}\n" for name in common_names
        ).encode()
        content["airgap-gpu.sha256"] = (
            f"{hashlib.sha256(content['nvidia-amd64.tar']).hexdigest()}  nvidia-amd64.tar\n"
        ).encode()
        archive_path = root / "valid.zip"
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_STORED) as archive:
            for name, value in content.items():
                archive.writestr(name, value)
        extract_verified_archive(archive_path, root / "valid")

        unsafe_path = root / "unsafe.zip"
        with zipfile.ZipFile(unsafe_path, "w") as archive:
            for name, value in content.items():
                archive.writestr("../escape" if name == "sources.lock" else name, value)
        try:
            extract_verified_archive(unsafe_path, root / "unsafe")
        except RuntimeError:
            pass
        else:
            fail("self-test did not reject an unsafe archive path")
    print("Parallel artifact downloader self-test passed.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--repository")
    parser.add_argument("--run-id", type=int)
    parser.add_argument("--head-sha")
    parser.add_argument("--stage-root")
    parser.add_argument("--workers", type=int, default=16)
    args = parser.parse_args()
    if not args.self_test and not all(
        [args.repository, args.run_id, args.head_sha, args.stage_root]
    ):
        parser.error("repository, run-id, head-sha and stage-root are required")
    return args


if __name__ == "__main__":
    try:
        arguments = parse_args()
        if arguments.self_test:
            self_test()
        else:
            run_download(arguments)
    except Exception as error:  # Deliberately concise: no token-bearing URL traceback.
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
