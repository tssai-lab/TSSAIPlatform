#!/usr/bin/env python3
"""Small deterministic PyTorch training job for validating TSS local DDP.

This is an environment smoke test, not a business benchmark.  It deliberately
uses generated tensors so that the first GPU/DDP Gate can validate rank setup,
data sharding, checkpoints and rank-0 publication without downloading a model
or dataset.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Mapping, NamedTuple


class RankContext(NamedTuple):
    rank: int
    local_rank: int
    world_size: int

    @property
    def distributed(self) -> bool:
        return self.world_size > 1

    @property
    def is_primary(self) -> bool:
        return self.rank == 0


def event(payload: dict) -> None:
    print("TSS_EVENT " + json.dumps(payload, ensure_ascii=False, sort_keys=True), flush=True)


def read_rank_context(environ: Mapping[str, str] | None = None) -> RankContext:
    values = os.environ if environ is None else environ

    def integer(name: str, default: int, minimum: int) -> int:
        raw = values.get(name, str(default))
        try:
            value = int(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{name} must be an integer") from exc
        if value < minimum:
            raise ValueError(f"{name} must be >= {minimum}")
        return value

    world_size = integer("WORLD_SIZE", 1, 1)
    rank = integer("RANK", 0, 0)
    local_rank = integer("LOCAL_RANK", 0, 0)
    if rank >= world_size:
        raise ValueError("RANK must be smaller than WORLD_SIZE")
    if world_size == 1 and (rank != 0 or local_rank != 0):
        raise ValueError("single-process mode requires RANK=0 and LOCAL_RANK=0")
    return RankContext(rank=rank, local_rank=local_rank, world_size=world_size)


def load_parameters(path: Path) -> dict:
    if not path.is_file():
        return {}
    parsed = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("params file must contain a JSON object")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--params-file", required=True)
    args = parser.parse_args()

    # Keep torch imports inside main: rank-contract unit tests run without a
    # CUDA/PyTorch installation, while the pinned Worker image provides torch.
    import torch
    import torch.distributed as dist
    from torch import nn
    from torch.nn.parallel import DistributedDataParallel
    from torch.utils.data import DataLoader, TensorDataset
    from torch.utils.data.distributed import DistributedSampler

    context = read_rank_context()
    params = load_parameters(Path(args.params_file))
    seed = int(params.get("seed", 20260723))
    epochs = max(1, int(params.get("epochs", 2)))
    batch_size = max(1, int(params.get("batchSize", 16)))
    samples = max(batch_size * context.world_size, int(params.get("samples", 128)))
    learning_rate = float(params.get("learningRate", 0.05))
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if context.distributed:
        if not torch.cuda.is_available():
            raise RuntimeError("DDP smoke test requires CUDA when WORLD_SIZE > 1")
        torch.cuda.set_device(context.local_rank)
        dist.init_process_group(backend="nccl")
        device = torch.device("cuda", context.local_rank)
    else:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    try:
        torch.manual_seed(seed)
        generator = torch.Generator().manual_seed(seed)
        features = torch.randn((samples, 8), generator=generator)
        labels = (features[:, :4].sum(dim=1) > features[:, 4:].sum(dim=1)).long()
        dataset = TensorDataset(features, labels)
        sampler = DistributedSampler(dataset, shuffle=True, seed=seed) if context.distributed else None
        loader = DataLoader(dataset, batch_size=batch_size, sampler=sampler, shuffle=sampler is None)

        model = nn.Sequential(nn.Linear(8, 16), nn.ReLU(), nn.Linear(16, 2)).to(device)
        if context.distributed:
            model = DistributedDataParallel(model, device_ids=[context.local_rank], output_device=context.local_rank)
        optimizer = torch.optim.SGD(model.parameters(), lr=learning_rate)
        loss_fn = nn.CrossEntropyLoss()

        if context.is_primary:
            event({"type": "progress", "progress": 1, "message": "DDP smoke test started"})

        latest_loss = 0.0
        for epoch in range(epochs):
            if sampler is not None:
                sampler.set_epoch(epoch)
            total_loss = 0.0
            total_examples = 0
            model.train()
            for batch_features, batch_labels in loader:
                batch_features = batch_features.to(device, non_blocking=True)
                batch_labels = batch_labels.to(device, non_blocking=True)
                optimizer.zero_grad(set_to_none=True)
                loss = loss_fn(model(batch_features), batch_labels)
                loss.backward()
                optimizer.step()
                total_loss += float(loss.detach()) * len(batch_labels)
                total_examples += len(batch_labels)

            aggregate = torch.tensor([total_loss, total_examples], dtype=torch.float64, device=device)
            if context.distributed:
                dist.all_reduce(aggregate, op=dist.ReduceOp.SUM)
            latest_loss = float(aggregate[0] / aggregate[1])
            if context.is_primary:
                progress = int((epoch + 1) * 90 / epochs)
                metrics = {"epoch": epoch + 1, "loss": latest_loss, "worldSize": context.world_size}
                event({"type": "metric", "metrics": metrics})
                event({"type": "progress", "progress": progress, "message": f"epoch {epoch + 1}/{epochs}"})

        if context.distributed:
            dist.barrier()
        if context.is_primary:
            base_model = model.module if context.distributed else model
            checkpoint = {
                "model": base_model.state_dict(),
                "optimizer": optimizer.state_dict(),
                "epoch": epochs,
                "worldSize": context.world_size,
                "seed": seed,
            }
            torch.save(checkpoint, output_dir / "checkpoint.pt")
            torch.save(base_model.state_dict(), output_dir / "best.bin")
            metrics = {
                "loss": latest_loss,
                "epochs": epochs,
                "worldSize": context.world_size,
                "samples": samples,
                "device": str(device),
            }
            (output_dir / "metrics.json").write_text(
                json.dumps(metrics, ensure_ascii=False, sort_keys=True, indent=2), encoding="utf-8"
            )
            event({"type": "progress", "progress": 100, "message": "DDP smoke test completed"})
    finally:
        if context.distributed and dist.is_initialized():
            dist.destroy_process_group()


if __name__ == "__main__":
    main()
