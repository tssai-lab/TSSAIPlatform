# YOLO 目标检测训练代码包

压缩本目录中的 `train.py` 和 `requirements.txt` 为 ZIP 后上传为训练代码。

基础模型 ZIP 必须包含 `yolo11n.pt`；数据集 ZIP 必须包含 `data.yaml`、图片目录和 YOLO 标签目录。创建任务时选择 `yolo_object_detection` 方案。

## 训练进度与指标上报协议（必读）

平台的训练进度条和指标曲线，依赖你的训练代码向 stdout 打印 **TSS_EVENT 事件**。本目录的 `train.py` 模板已内置上报逻辑（每个 epoch 自动上报进度和指标），直接使用即可。**如果你编写自己的训练代码，请遵循以下协议，否则进度条会卡住、指标无法显示。**

### 1. 进度事件

每个 epoch（或周期性）打印一行：

```
TSS_EVENT {"type": "progress", "progress": 50}
```

要求：
1. **独占一行，行首必须是 `TSS_EVENT `**（含末尾空格），后面是合法 JSON；
2. **`progress` 必须是 0~100 的完成度数值**（例如 `round(epoch / epochs * 100)`），**不能传 epoch 数或字符串**——传 1、2、3 这种 epoch 序号会被映射成接近 45 的同一个值，进度条看不出变化；
3. **打印后必须 flush**（`print(..., flush=True)`）。训练容器里 stdout 是管道而非终端，不 flush 会被缓冲，事件直到训练结束才一次性到达，表现就是"进度一直卡在 45%"。

### 2. 指标事件

训练算出的指标可同样上报，用于训练完成后的指标可视化：

```
TSS_EVENT {"type": "metric", "metrics": {"train_loss": 0.32, "val_mAP50": 0.81}}
```

平台可视化优先识别的标准指标名（写进 `metrics.json` 或 metric 事件均可）：`train_loss`、`val_loss`、`val_accuracy`、`val_precision`、`val_recall`、`val_mAP50`、`val_mAP50_95` 等。

### 3. 平台侧显示说明

- 进度条在准备阶段显示 0~45，训练阶段显示 45~85，最后校验/上传阶段跳到 100。你的进度事件会按比例映射到训练阶段区间，所以训练中进度条数值不会精确等于你上报的数值，但会随上报实时推进。
- 训练完成后，最终指标会被平台写入 MLflow，指标可视化页面即可展示曲线。
