from __future__ import annotations

import hashlib
import io
import os
import sys
import threading
import time
import types
import unittest
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

try:
    import minio  # noqa: F401
except ModuleNotFoundError:
    minio_stub = types.ModuleType("minio")

    class Minio:  # pragma: no cover - import-only test stub.
        pass

    minio_stub.Minio = Minio
    sys.modules["minio"] = minio_stub

import infer_worker


class FakeResponse(io.BytesIO):
    def __init__(self, payload: bytes, read_delay: float = 0):
        super().__init__(payload)
        self.read_delay = read_delay

    def read(self, size: int = -1) -> bytes:
        if self.read_delay:
            time.sleep(self.read_delay)
        return super().read(size)

    def release_conn(self) -> None:
        return None


class FakeMinio:
    def __init__(self, payload: bytes, read_delay: float = 0):
        self.payload = payload
        self.read_delay = read_delay
        self.calls = 0
        self._lock = threading.Lock()

    def get_object(self, bucket: str, object_name: str) -> FakeResponse:
        del bucket, object_name
        with self._lock:
            self.calls += 1
        return FakeResponse(self.payload, self.read_delay)


def model_zip() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("weights/model.bin", b"weight-data")
        archive.writestr("config.json", b'{"format":"test"}')
    return buffer.getvalue()


class ModelCacheTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "model-cache"
        self.root.mkdir()
        (self.root / ".tss-model-cache-root").write_text("tss-model-cache-v1\n")
        self.log_patch = patch.object(
            infer_worker,
            "LOG_FILE",
            Path(self.temp.name) / "infer.log",
        )
        self.log_patch.start()
        self.addCleanup(self.log_patch.stop)

    def cache_env(self, payload: bytes, digest: str | None = None) -> dict[str, str]:
        cache_key = digest or hashlib.sha256(payload).hexdigest()
        return {
            "MODEL_CACHE_ROOT": str(self.root),
            "MODEL_CACHE_KEY": cache_key,
            "MODEL_EXPECTED_SHA256": cache_key,
            "MODEL_EXPECTED_SIZE_BYTES": str(len(payload)),
            "MODEL_CACHE_MAX_BYTES": str(10 * 1024 * 1024),
            "MODEL_CACHE_MIN_FREE_BYTES": "0",
            "MODEL_CACHE_EVICTION_GRACE_SECONDS": "0",
            "MODEL_STORAGE_PATH": "users/7/models/model.zip",
        }

    def test_cache_miss_then_hit_downloads_once(self) -> None:
        payload = model_zip()
        client = FakeMinio(payload)
        with patch.dict(os.environ, self.cache_env(payload), clear=True):
            first = infer_worker.prepare_model_cache(client, "models")
            second = infer_worker.prepare_model_cache(client, "models")

        self.assertEqual(first, second)
        self.assertEqual(client.calls, 1)
        self.assertEqual((first / "weights/model.bin").read_bytes(), b"weight-data")
        self.assertTrue((first.parent / ".complete.json").is_file())

    def test_digest_mismatch_removes_partial_files(self) -> None:
        payload = model_zip()
        wrong_digest = "0" * 64
        client = FakeMinio(payload)
        with patch.dict(
            os.environ,
            self.cache_env(payload, digest=wrong_digest),
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                infer_worker.prepare_model_cache(client, "models")

        self.assertFalse((self.root / "entries" / wrong_digest).exists())
        self.assertEqual(list((self.root / "tmp").iterdir()), [])

    def test_incomplete_entry_is_replaced(self) -> None:
        payload = model_zip()
        digest = hashlib.sha256(payload).hexdigest()
        client = FakeMinio(payload)
        with patch.dict(os.environ, self.cache_env(payload), clear=True):
            data_dir = infer_worker.prepare_model_cache(client, "models")
            (data_dir.parent / ".complete.json").unlink()
            rebuilt = infer_worker.prepare_model_cache(client, "models")

        self.assertEqual(client.calls, 2)
        self.assertEqual((rebuilt / "weights/model.bin").read_bytes(), b"weight-data")
        self.assertTrue((rebuilt.parent / ".complete.json").is_file())
        self.assertEqual(rebuilt.parent.name, digest)

    def test_concurrent_requests_for_same_digest_download_once(self) -> None:
        payload = model_zip()
        client = FakeMinio(payload, read_delay=0.05)
        environment = self.cache_env(payload)

        def prepare() -> Path:
            return infer_worker.prepare_model_cache(client, "models")

        with patch.dict(os.environ, environment, clear=True):
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(lambda _: prepare(), range(2)))

        self.assertEqual(results[0], results[1])
        self.assertEqual(client.calls, 1)


    def test_zip_traversal_is_rejected_without_publishing_entry(self) -> None:
        buffer = io.BytesIO()
        with zipfile.ZipFile(
            buffer,
            "w",
            compression=zipfile.ZIP_DEFLATED,
        ) as archive:
            archive.writestr("../escape.bin", b"not-allowed")
        payload = buffer.getvalue()
        digest = hashlib.sha256(payload).hexdigest()
        client = FakeMinio(payload)

        with patch.dict(os.environ, self.cache_env(payload), clear=True):
            with self.assertRaisesRegex(ValueError, "unsafe zip path"):
                infer_worker.prepare_model_cache(client, "models")

        self.assertFalse((self.root / "entries" / digest).exists())
        self.assertEqual(list((self.root / "tmp").iterdir()), [])

    def test_zip_expansion_beyond_cache_limit_is_rejected(self) -> None:
        buffer = io.BytesIO()
        with zipfile.ZipFile(
            buffer,
            "w",
            compression=zipfile.ZIP_DEFLATED,
        ) as archive:
            archive.writestr("weights/model.bin", b"A" * 4096)
        payload = buffer.getvalue()
        environment = self.cache_env(payload)
        environment["MODEL_CACHE_MAX_BYTES"] = str(len(payload) + 64)
        digest = hashlib.sha256(payload).hexdigest()
        client = FakeMinio(payload)

        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaisesRegex(ValueError, "expands beyond cache limit"):
                infer_worker.prepare_model_cache(client, "models")

        self.assertFalse((self.root / "entries" / digest).exists())
        self.assertEqual(list((self.root / "tmp").iterdir()), [])

    def test_main_worker_skips_model_download_when_cache_is_mounted(self) -> None:
        workspace = Path(self.temp.name) / "workspace"
        model_dir = workspace / "model"
        script_dir = workspace / "script"
        input_dir = workspace / "input"
        output_dir = workspace / "output"
        model_dir.mkdir(parents=True)
        (model_dir / "weights.bin").write_bytes(b"cached")

        script_buffer = io.BytesIO()
        with zipfile.ZipFile(script_buffer, "w") as archive:
            archive.writestr("infer.py", "print('ok')\n")

        environment = {
            "MODEL_CACHE_ENABLED": "true",
            "MODEL_STORAGE_PATH": "users/7/models/model.zip",
            "SCRIPT_STORAGE_PATH": "users/7/scripts/script.zip",
            "INPUT_MODE": "SINGLE_OBJECT",
            "INPUT_OBJECT_NAME": "users/7/files/input.bin",
        }
        with (
            patch.dict(os.environ, environment, clear=True),
            patch.object(infer_worker, "WORKSPACE", workspace),
            patch.object(infer_worker, "MODEL_DIR", model_dir),
            patch.object(infer_worker, "SCRIPT_DIR", script_dir),
            patch.object(infer_worker, "INPUT_DIR", input_dir),
            patch.object(infer_worker, "OUTPUT_DIR", output_dir),
            patch.object(
                infer_worker,
                "download_object",
                side_effect=[script_buffer.getvalue(), b"input"],
            ) as download,
        ):
            input_path = infer_worker.prepare_workspace(object(), "models")

        self.assertEqual(input_path.read_bytes(), b"input")
        self.assertEqual(download.call_count, 2)
        downloaded_names = [call.args[2] for call in download.call_args_list]
        self.assertEqual(
            downloaded_names,
            ["users/7/scripts/script.zip", "users/7/files/input.bin"],
        )

if __name__ == "__main__":
    unittest.main()
