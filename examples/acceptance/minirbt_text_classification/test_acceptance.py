import importlib.util
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def load_module(name: str, file_name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / file_name)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


train = load_module("minirbt_acceptance_train", "train.py")
infer = load_module("minirbt_acceptance_infer", "infer.py")
prepare = load_module("minirbt_acceptance_prepare", "prepare.py")


class DatasetContractTest(unittest.TestCase):
    def write_package(self, root: Path, *, labels=None, rows=None):
        labels = labels or ["负面", "正面"]
        rows = rows or {
            "train": [
                {"id": "train-n", "text": "体验很差", "label": "负面"},
                {"id": "train-p", "text": "体验很好", "label": "正面"},
            ],
            "validation": [{"id": "val-p", "text": "运行顺利", "label": "正面"}],
            "test": [{"id": "test-n", "text": "任务失败", "label": "负面"}],
        }
        (root / "data").mkdir(parents=True)
        (root / "dataset.json").write_text(
            json.dumps({"schemaVersion": train.DATASET_SCHEMA, "labels": labels}, ensure_ascii=False),
            encoding="utf-8",
        )
        for split, records in rows.items():
            (root / "data" / f"{split}.jsonl").write_text(
                "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
                encoding="utf-8",
            )

    def test_accepts_complete_three_split_dataset(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.write_package(root)
            labels, splits = train.load_dataset_package(root)
            self.assertEqual(["负面", "正面"], labels)
            self.assertEqual({"train", "validation", "test"}, set(splits))

    def test_rejects_empty_text_unknown_label_duplicate_id_and_single_class_training(self):
        cases = []
        base = {
            "train": [
                {"id": "a", "text": "差", "label": "负面"},
                {"id": "b", "text": "好", "label": "正面"},
            ],
            "validation": [{"id": "c", "text": "一般", "label": "正面"}],
            "test": [{"id": "d", "text": "不好", "label": "负面"}],
        }
        empty = {key: [dict(item) for item in value] for key, value in base.items()}
        empty["test"][0]["text"] = " "
        cases.append(empty)
        unknown = {key: [dict(item) for item in value] for key, value in base.items()}
        unknown["test"][0]["label"] = "未知"
        cases.append(unknown)
        duplicate = {key: [dict(item) for item in value] for key, value in base.items()}
        duplicate["test"][0]["id"] = "a"
        cases.append(duplicate)
        single_class = {key: [dict(item) for item in value] for key, value in base.items()}
        single_class["train"] = [single_class["train"][0]]
        cases.append(single_class)
        for rows in cases:
            with self.subTest(rows=rows), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                self.write_package(root, rows=rows)
                with self.assertRaises(ValueError):
                    train.load_dataset_package(root)

    def test_inference_reads_dataset_split_and_plain_text(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.write_package(root)
            self.assertEqual("任务失败", infer.load_records(root, "test")[0]["text"])
            plain = root / "input.txt"
            plain.write_text("第一条\n\n第二条\n", encoding="utf-8")
            self.assertEqual(2, len(infer.load_records(plain, "test")))

    def test_generated_dataset_has_expected_small_complete_shape(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "dataset.zip"
            prepare.build_dataset_zip(output)
            import zipfile

            with zipfile.ZipFile(output) as archive:
                self.assertEqual(
                    {
                        "dataset.json",
                        "data/train.jsonl",
                        "data/validation.jsonl",
                        "data/test.jsonl",
                    },
                    set(archive.namelist()),
                )
                train_rows = [
                    json.loads(line)
                    for line in archive.read("data/train.jsonl").decode("utf-8").splitlines()
                ]
                self.assertEqual({"负面", "正面"}, {row["label"] for row in train_rows[:2]})

    def test_generated_model_archive_uses_platform_accepted_file_names(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            cache = root / "cache"
            output = root / "model.zip"

            def fake_download(_url, target, _expected_sha256):
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"acceptance-fixture")

            with mock.patch.object(prepare, "download_verified", side_effect=fake_download):
                prepare.build_model_zip(output, cache)

            import zipfile

            with zipfile.ZipFile(output) as archive:
                names = set(archive.namelist())
            self.assertEqual(
                {
                    "LICENSE.txt",
                    "UPSTREAM_README.md",
                    "config.json",
                    "model.yaml",
                    "pytorch_model.bin",
                    "vocab.txt",
                },
                names,
            )
            self.assertTrue(all(Path(name).suffix for name in names))

    def test_rejects_invalid_training_and_inference_limits(self):
        with self.assertRaisesRegex(ValueError, "batchSize"):
            train.validate_training_parameters(
                epochs=2,
                batch_size=0,
                learning_rate=0.0001,
                weight_decay=0.01,
                max_length=64,
                seed=42,
                max_train=0,
                max_eval=0,
            )
        with tempfile.TemporaryDirectory() as temp:
            empty_json = Path(temp) / "empty.json"
            empty_json.write_text('[{"text":" "}]', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "no non-empty text"):
                infer.load_records(empty_json, "test")
        with self.assertRaisesRegex(ValueError, "split"):
            infer.validate_inference_parameters(
                split="../../secret", max_texts=10, batch_size=8, max_length=64
            )


if __name__ == "__main__":
    unittest.main()
