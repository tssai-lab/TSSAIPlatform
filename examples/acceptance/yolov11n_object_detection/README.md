# YOLO11n 小型目标检测 CPU 验收包

本包用于验证“模型上传 → 数据集上传/预览 → 自定义方案导入 → CPU 训练 → 日志/指标 → 结果模型 → 推理”功能闭环，不用于证明生产精度、吞吐或 GPU 能力。

## 文件用途

- `yolo11n-base-model.zip`：作为 CV 模型上传，类别选 CV；
- `yolo11n-coco128-dataset.zip`：作为 CV/目标检测/YOLO 数据集上传；
- `yolo11n-training-code.zip`：训练代码，入口为 `train.py`；
- `yolo11n-inference-script.zip`：推理脚本，入口为 `infer.py`；
- `yolov11n_object_detection_cpu-v1.yaml`：由超级管理员导入的 CPU 训练方案；
- `acceptance-manifest.json`：文件大小、SHA-256、模型来源和数据来源说明。

数据集来自官方 COCO128 归档，包含 COCO train2017 的前 128 张图片和 80 类 YOLO 标注。为了避免官方轻量示例中训练集和验证集重用同一批图片，本包按图片 ID 哈希固定划分为训练 96 张、验证 16 张、测试 16 张，三个集合互不重叠。

上游归档中有两张背景图片没有对应标签，同时有两个标签找不到对应图片。本包为背景图片补充空标签，并丢弃两个孤立标签；图片像素和其余非空标注不变。具体来源、修改和上游许可文件见 `COCO128_SOURCE_AND_LICENSE.md`。

## 建议参数

```json
{"epochs":2,"batch":2,"imgsz":160,"learningRate":0.001}
```

CPU 验收主要看任务能否完成、日志和指标是否完整、`best.pt`/`last.pt` 是否生成，不设置最低 mAP 门槛。

## 许可证提醒

`yolo11n.pt` 来源于 Ultralytics assets v8.3.0，模型及相关软件受 AGPL-3.0 或另行购买的 Ultralytics 商业许可证约束。向甲方交付或用于闭源系统前，应由项目负责人确认适用授权。本包保留上游许可证和固定来源，不代表替甲乙双方作出法律判断。

COCO128 来源于 COCO 数据集与 Ultralytics 官方归档。交付时必须同时保留本包中的来源、修改说明、上游 LICENSE 和 README，并引用 COCO 论文：*Microsoft COCO: Common Objects in Context*（Lin 等，2015）。
