# TSS GPU training Worker

The Worker downloads and verifies immutable model, dataset and code artifacts,
then runs only the approved Python entrypoint from the RunSpec.

## Distributed execution

The first distributed mode is intentionally limited to a single Kubernetes Pod
with multiple GPUs:

```json
{
  "execution": {
    "argv": ["python", "/workspace/job/code/train.py"],
    "workingDirectory": "/workspace/job/code",
    "distributed": {
      "strategy": "PYTORCH_DDP",
      "scope": "SINGLE_NODE",
      "worldSize": 2,
      "processesPerNode": 2
    }
  }
}
```

The Worker requires an `NVIDIA_GPU` runtime and `gpuCount` equal to
`processesPerNode`. It launches the approved entrypoint with:

```text
python -m torch.distributed.run --standalone --nproc_per_node=<N> <entrypoint>
```

`torch.distributed.run` sets `RANK`, `LOCAL_RANK`, `WORLD_SIZE`,
`MASTER_ADDR` and `MASTER_PORT`. Training code must initialize the process
group, use `DistributedDataParallel` and `DistributedSampler`, and only let
rank 0 publish the final model or a primary MLflow run.

`MULTI_NODE` is deliberately rejected at this stage. It requires dedicated
Kubernetes multi-Pod orchestration, a private rendezvous service, NetworkPolicy
and NCCL validation; a single Worker Pod must not simulate it.
