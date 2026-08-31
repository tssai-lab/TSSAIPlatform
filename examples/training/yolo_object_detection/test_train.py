import contextlib
import importlib.util
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("yolo_training_entry", ROOT / "train.py")
train = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(train)


class FakeScalar:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


class YoloMetricProtocolTest(unittest.TestCase):
    def test_ensure_ultralytics_font_uses_runtime_local_font(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "DejaVuSans.ttf"
            source.write_bytes(b"font")

            target = train.ensure_ultralytics_font(root / "config", source)

            self.assertEqual(root / "config" / "Arial.ttf", target)
            self.assertEqual(b"font", target.read_bytes())

    def test_package_primary_model_creates_required_model_zip(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            published_pt = output / "yolo11n.pt"
            published_pt.write_bytes(b"weights")

            archive = train.package_primary_model(published_pt, output)
            unpacked = output / "unpacked"
            shutil.unpack_archive(archive, unpacked)

            self.assertEqual(output / "model.zip", archive)
            self.assertEqual(b"weights", (unpacked / "yolo11n.pt").read_bytes())

    def test_resolve_data_manifest_anchors_relative_paths_to_data_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_root = root / "dataset"
            output = root / "output"
            data_root.mkdir()
            output.mkdir()
            source = data_root / "data.yaml"
            source.write_text(
                "path: .\ntrain: images/train\nval: images/val\n",
                encoding="utf-8",
            )

            resolved = train.resolve_data_manifest(source, data_root, output)

            text = resolved.read_text(encoding="utf-8")
            self.assertIn(f"path: {json.dumps(str(data_root.resolve()))}", text)
            self.assertNotIn("path: .", text)
            self.assertIn("train: images/train", text)
            self.assertIn("val: images/val", text)

    def test_completed_epoch_event_has_step_and_canonical_metrics(self):
        trainer = type(
            "Trainer",
            (),
            {
                "epoch": 1,
                "epochs": 4,
                "tloss": [FakeScalar(0.4), FakeScalar(0.3), FakeScalar(0.2)],
                "metrics": {
                    "metrics/mAP50(B)": 0.5,
                    "metrics/mAP50-95(B)": 0.25,
                    "metrics/precision(B)": 0.6,
                    "metrics/recall(B)": 0.7,
                },
            },
        )()
        output = io.StringIO()

        with contextlib.redirect_stdout(output):
            train.on_epoch_end(trainer)

        events = [
            json.loads(line.removeprefix("TSS_EVENT "))
            for line in output.getvalue().splitlines()
        ]
        metric = next(event for event in events if event["type"] == "metric")
        self.assertEqual(2, metric["step"])
        self.assertAlmostEqual(0.9, metric["metrics"]["train_loss"])
        self.assertEqual(0.5, metric["metrics"]["val_mAP50"])
        self.assertEqual(0.25, metric["metrics"]["val_mAP50_95"])

    def test_results_csv_produces_one_metric_snapshot_per_epoch(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "results.csv"
            csv_path.write_text(
                "epoch,train/box_loss,train/cls_loss,train/dfl_loss,"
                "metrics/precision(B),metrics/recall(B),metrics/mAP50(B),metrics/mAP50-95(B)\n"
                "1,0.5,0.4,0.3,0.1,0.2,0.3,0.15\n"
                "2,0.4,0.3,0.2,0.2,0.3,0.4,0.2\n",
                encoding="utf-8",
            )

            history = train.result_history(csv_path)

        self.assertEqual([1, 2], [step for step, _ in history])
        self.assertAlmostEqual(1.2, history[0][1]["train_loss"])
        self.assertAlmostEqual(0.9, history[1][1]["train_loss"])
        self.assertEqual(0.4, history[1][1]["val_mAP50"])


if __name__ == "__main__":
    unittest.main()
