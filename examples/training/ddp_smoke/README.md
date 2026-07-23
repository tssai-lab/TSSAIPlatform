# PyTorch DDP 环境冒烟训练

这是用于 Gate 4 和 Gate 5 的合成数据训练，不是 CV/NLP 业务验收数据集。

它用于验证：

- `torch.distributed.run` 能启动多进程；
- 每个进程获得正确的 `RANK`、`LOCAL_RANK`、`WORLD_SIZE`；
- `DistributedSampler` 对数据做分片，并在每个 Epoch 调用 `set_epoch()`；
- `DistributedDataParallel` 使用 NCCL 同步参数；
- 指标通过 `all_reduce` 汇总；
- 只有 Rank 0 写入 `best.bin`、`checkpoint.pt`、`metrics.json` 和 TSS 事件。

在两张本机 GPU 上的直接验证命令：

```bash
python -m torch.distributed.run --standalone --nproc_per_node=2 train.py \
  --output-dir /workspace/job/output \
  --params-file /workspace/job/config/params.json
```

最终接入平台时，必须使用 `k8s/training-worker` 的 `SINGLE_NODE` DDP
RunSpec；不要手工在宿主机运行上述命令。

跨节点 DDP 不在本示例范围内。它需要 Kubernetes 多 Pod 编排、私网
Rendezvous、NetworkPolicy 和 NCCL 网络验证后，才可单独实现和启用。
