# MiniRBT-H288 + MASSIVE 中文意图分类 CPU/单卡 GPU 验收包

本目录提供一套小型、离线、可复现的 NLP 验收资产。模型、数据集、训练代码和推理脚本分别上传；发起训练时再选择 CPU 或单卡 GPU 训练方案。目标是验证“上传 → 训练 → 指标/日志 → 结果模型 → 推理 → 原文与预测展示”，不承诺生产精度或吞吐。

## 1. 模型与数据来源

- 基础模型：`hfl/minirbt-h288`；
- 固定 revision：`dc4eebb0cf6f9e7094142ac28fbf971517c6a366`；
- 模型许可：Apache-2.0；
- 数据集：Amazon Science MASSIVE v1.1 的 `zh-CN` 官方数据；
- 数据许可：CC BY 4.0；
- 官方 MASSIVE 归档 SHA-256：`4cba5faa11c71437928e17cb1b9b3d8b8e727e7ea363a3a9a8045e19c0491577`。

验收子集保留六个原始意图：`alarm_set`、`weather_query`、`play_music`、`news_query`、`calendar_set`、`transport_taxi`。每类固定选取训练 24 条、验证 8 条、测试 8 条，共 240 条。筛选只依据官方样本 ID，文本和意图标签不改写；官方 `dev` 分区仅改名为平台使用的 `validation`。

## 2. 生成验收文件

在仓库根目录运行：

```bash
python examples/acceptance/minirbt_text_classification/prepare.py \
  --output-dir dist/minirbt-massive-acceptance
```

生成：

- `minirbt-h288-base.zip`：上传为 NLP 模型；
- `massive-zhcn-intent-dataset.zip`：上传为 NLP 数据集；
- `minirbt-training-code.zip`：上传为训练代码，入口 `train.py`；
- `minirbt-inference-script.zip`：上传为推理脚本，入口 `infer.py`；
- `minirbt_text_classification-v1.yaml`：CPU 训练方案；
- `minirbt_text_classification_gpu-v1.yaml`：单卡 NVIDIA GPU 训练方案；
- `acceptance-manifest.json`：记录文件大小、SHA-256、模型与数据来源。

数据集 ZIP 内含完整 CC BY 4.0 原文、MASSIVE 官方 NOTICE、引用说明和修改记录。交付或再分发时不得删除这些文件。

## 3. 数据与模型契约

模型 ZIP 根目录：

```text
model.yaml
config.json
pytorch_model.bin
vocab.txt
LICENSE.txt
UPSTREAM_README.md
```

数据集 ZIP 的训练输入：

```text
dataset.json
data/train.jsonl
data/validation.jsonl
data/test.jsonl
```

每条 JSONL 为：

```json
{"id":"massive-zh-CN-test-123","text":"明天早上七点叫醒我","label":"alarm_set"}
```

训练脚本会失败关闭：缺少三段数据、空文本、未知标签、重复 ID、训练集缺少某个类别、离线模型文件缺失均不会静默降级。

## 4. 建议验收参数

CPU 训练建议 2 轮；单卡 GPU 的小型闭环建议 1 轮。其余参数一致：

```json
{
  "epochs": 1,
  "batchSize": 8,
  "lr": 0.0001,
  "weightDecay": 0.01,
  "maxSeqLength": 64,
  "seed": 42,
  "maxTrainSamples": 0,
  "maxEvalSamples": 0
}
```

推理参数：

```json
{"split":"test","maxTexts":20,"batchSize":8,"maxSeqLength":64}
```

## 5. 验收边界

1. 训练和推理都必须离线加载模型，运行 Pod 不从 Hugging Face 下载文件；
2. 训练结果至少包含 loss、accuracy、precision、recall、F1、验证/测试预测和结果模型 ZIP；
3. 推理结果必须包含原始文本、预测标签和置信度；
4. Job/Pod 被 TTL 清理后，训练日志、指标和结果模型仍应能从对象存储查看或下载；
5. GPU 方案严格要求容器内只可见一张 CUDA 卡，设备为 `cuda:0`，不允许静默退回 CPU；
6. 2026-08-29 已在内网 NVIDIA RTX 4080 上连续完成 3 次单卡 GPU 训练，并用第 3 次结果完成 20 条文本的真实推理；CPU 训练、并发、多卡和大数据性能仍需另行测试。
