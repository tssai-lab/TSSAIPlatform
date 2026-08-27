import tempfile
import unittest
import zipfile
from pathlib import Path

import prepare


class YoloAcceptanceBundleTest(unittest.TestCase):
    def fake_coco128(self, path: Path) -> None:
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("coco128/LICENSE", "license")
            archive.writestr("coco128/README.txt", "readme")
            for index in range(128):
                stem = f"{index:012d}"
                archive.writestr(f"coco128/images/train2017/{stem}.jpg", b"image")
                if index < 126:
                    archive.writestr(
                        f"coco128/labels/train2017/{stem}.txt",
                        b"0 0.500000 0.500000 0.250000 0.250000\n",
                    )
            archive.writestr("coco128/labels/train2017/999999999998.txt", b"0 0.5 0.5 0.2 0.2\n")
            archive.writestr("coco128/labels/train2017/999999999999.txt", b"0 0.5 0.5 0.2 0.2\n")

    def test_dataset_is_small_complete_and_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "coco128.zip"
            first = Path(directory) / "first.zip"
            second = Path(directory) / "second.zip"
            self.fake_coco128(source)
            first_splits = prepare.build_dataset_zip(first, source)
            second_splits = prepare.build_dataset_zip(second, source)
            prepare.validate_dataset_zip(first)
            self.assertEqual(first_splits, second_splits)
            self.assertEqual(prepare.sha256_file(first), prepare.sha256_file(second))
            with zipfile.ZipFile(first) as archive:
                self.assertEqual(257, len(archive.namelist()))
                self.assertIn("data.yaml", archive.namelist())

    def test_fixed_split_is_disjoint_and_complete(self):
        stems = [f"{index:012d}" for index in range(128)]
        splits = prepare.split_stems(stems)
        self.assertEqual(prepare.SPLIT_COUNTS, {key: len(value) for key, value in splits.items()})
        self.assertEqual(128, len(set().union(*map(set, splits.values()))))
        self.assertFalse(set(splits["train"]) & set(splits["val"]))
        self.assertFalse(set(splits["train"]) & set(splits["test"]))
        self.assertFalse(set(splits["val"]) & set(splits["test"]))


if __name__ == "__main__":
    unittest.main()
