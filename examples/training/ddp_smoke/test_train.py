import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("train.py")
SPEC = importlib.util.spec_from_file_location("tss_ddp_smoke", MODULE_PATH)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = worker
SPEC.loader.exec_module(worker)


class DdpSmokeRankContractTest(unittest.TestCase):
    def test_single_process_defaults_are_rank_zero(self):
        context = worker.read_rank_context({})

        self.assertEqual((0, 0, 1), tuple(context))
        self.assertFalse(context.distributed)
        self.assertTrue(context.is_primary)

    def test_torchrun_environment_describes_non_primary_rank(self):
        context = worker.read_rank_context({"WORLD_SIZE": "2", "RANK": "1", "LOCAL_RANK": "1"})

        self.assertTrue(context.distributed)
        self.assertFalse(context.is_primary)

    def test_invalid_rank_is_rejected_before_torch_initialization(self):
        with self.assertRaisesRegex(ValueError, "smaller than WORLD_SIZE"):
            worker.read_rank_context({"WORLD_SIZE": "2", "RANK": "2", "LOCAL_RANK": "0"})


if __name__ == "__main__":
    unittest.main()
