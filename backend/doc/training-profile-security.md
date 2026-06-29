# 训练 Profile 安全边界与代码审核

## 代码模型包（过渡概念）

当前阶段平台将训练脚本、模型权重与配置文件统一称为**代码模型包**（code-model zip），作为向后续严谨版本拆分的过渡设计：

| 内容 | 示例路径 |
| --- | --- |
| 训练代码 | `scripts/train.py`、`scripts/training/train_fusion_baseline.py` |
| 模型权重 | `weights/best.pt`、`weights/last.pt`、`weights/*.pth` |
| 配置文件 | `config/*.yaml` |

**元数据**：短期仍复用 `code_asset` / `code_version` 表与 `codeVersionId`，**不**新增 `modelVersionId` / `baseModelVersionId`。

**上传校验**：`POST /api/code/upload` 允许常见代码、配置与权重扩展名（`.py`、`.json`、`.jsonl`、`.pt`、`.pth` 等），拒绝 shell/可执行文件（`.sh`、`.exe` 等）与无扩展名文件；保留 ZIP 路径穿越与体积限制。**不强制** `scripts/`、`weights/`、`config/` 目录结构。

**训练行为**：当前唯一 profile `image_text_consistency_fusion_logreg` 的 Worker **不会**自动加载 `weights/` 下权重；仍执行硬编码白名单命令。`hyperParams` 仅记录/预留，不能覆盖命令。

**训练方案文案**：后端字段仍为 `trainingProfile`（`image_text_consistency_fusion_logreg`），用户可见文案统一为「训练方案 / 图文一致性基线训练」；前端在训练配置区与详情页展示展示名，内部 ID 仅作为小字/高级信息显示。

**训练产物下载**：详情页训练产物（`fusion_model.pkl`、`metrics.json`、`val_predictions.csv`、`test_predictions.csv`、`train.log`）复用 `GET /api/files/download?objectName=`；前端将 `minio://training-results/.../artifacts/<file>` 转换为 `objectName` 后下载，用户无需手动复制 `minio://` 路径。

### K8s Worker MLflow logging（观测能力）

K8s Worker（`k8s/training-worker/train.py`）在 Pod 内通过 MLflow REST API 直写（与后端 `MlflowTrackingService` 同一套端点），**不依赖 `mlflow` Python SDK**，兼容平台 lite MLflow server（仅实现 REST 子集，无 artifact 存储）。

- **Tracking URI**：Pod 内 `MLFLOW_TRACKING_URI=http://tss-mlflow:5000`（K8s Service，与宿主机 `127.0.0.1:5000` 同一实例）。
- **Experiment**：`MLFLOW_EXPERIMENT_NAME`，默认 `TSSAI-K8s-Training`（`training.kubernetes.mlflow-experiment-name`，可 env 覆盖）。
- **Run name**：`{trainingId}-{trainingProfile}`。
- **Params**：`trainingId`、`trainingProfile`、`trainingProfileDisplayName`、`codeVersionId`、`datasetVersionId`、`codeStoragePath`、`datasetStoragePath`、`hyperParams`、`fixedCommand`。
- **Metrics**（从 `metrics.json` 解析，统一键名）：`train_/val_/test_` × `accuracy/precision/recall/f1/roc_auc`。
- **Artifacts**：平台 lite MLflow server **未实现 artifact 存储**，故 MLflow 仅记录 params/metrics/tags；训练产物（`fusion_model.pkl`、`metrics.json`、`val_predictions.csv`、`test_predictions.csv`、`train.log`）仍以 MinIO 为主，详情页统一展示并复用 `/api/files/download`。如需 MLflow 内浏览 artifacts，需后续将 lite server 升级为完整 `mlflow server`（含 artifact store）。
- **回写**：回调 `/api/internal/training/result` 携带 `runId`、`mlflowExperimentId`、`mlflowTrackingUri`；后端 `applyResult` 存入 `training_experiment_version`（`run_id`、`mlflow_experiment_id`、`mlflow_tracking_uri`），`/api/task/detail` 返回 `runId`，前端详情页自动加载 MLflow 指标。

**容错（关键）**：MLflow 是观测能力，**不得影响训练成败**。所有 MLflow 调用包 try/except，失败时 Worker 打 warning 并继续；训练仍可 `success`，回调 `runId` 为空；前端显示「当前任务未关联 MLflow Run，或暂无可视化指标」空状态。

**K8s Job env**（`KubernetesJobManifestBuilder`）：`TRAINING_ID`、`TRAINING_PROFILE`、`CODE_VERSION_ID`、`DATASET_VERSION_ID`、`CODE_STORAGE_PATH`、`DATASET_STORAGE_PATH`、`HYPER_PARAMS_JSON`、`MINIO_*`、`MLFLOW_TRACKING_URI`、`MLFLOW_EXPERIMENT_NAME`、`BACKEND_CALLBACK_URL`、`INTERNAL_CALLBACK_TOKEN`。

**前端联调**：前端 `/mlflow-api/` 代理需指向**同一个** MLflow 实例（`DEV_MLFLOW_TARGET=http://127.0.0.1:5000`），否则看不到 Worker 写入的 run。local MLflow 同时支持 `/api/` 与 `/ajax-api/`，与现有 rewrite 兼容。

**后续设计**：更严谨版本将拆分为 `codeVersionId`（训练代码）+ `baseModelVersionId`（基础权重）。

## 当前定位

TSS 平台**不是**开放式任意代码执行平台。带 `codeVersionId` 的 profile 训练仅允许：

1. 平台预注册的 `trainingProfile`（当前：`image_text_consistency_fusion_logreg`）
2. Worker 内硬编码的白名单命令（不可通过 `hyperParams` 覆盖）
3. 经管理员审核（`approval_status = APPROVED`）或自动准入校验通过的代码模型版本

## approval_status（平台级）

| 状态 | 含义 |
| --- | --- |
| `PENDING` | 上传后默认状态，**不可**用于创建训练任务 |
| `APPROVED` | 准入校验通过，可用于 profile 训练 |
| `REJECTED` | 预留，本阶段无 reject API |

### 准入校验接口（training-check）

```
GET /api/code/version/{codeVersionId}/training-check?trainingProfile=image_text_consistency_fusion_logreg
```

后端按顺序检查：

1. codeVersion 存在
2. `status = READY`
3. `storagePath` 非空
4. `trainingProfile` 受支持
5. `codeAsset.trainingProfile` 与传入 profile 匹配
6. ZIP 通过 `CodeModelZipValidator` 路径/扩展名校验
7. ZIP 包含固定入口脚本（fusion profile 要求 `scripts/training/train_fusion_baseline.py`）

全部通过时后端自动将 `approval_status` 置为 `APPROVED`，并返回 `passed=true`；任一不通过则 `passed=false` 并返回 `reasons[]`，`approval_status` 保持原状。

### 自动 APPROVED ≠ 代码安全审计

**重要**：`training-check` 自动写入的 `APPROVED` 只代表**结构、元数据、固定入口检查通过**，**不代表**已完成代码安全审计。当前自动校验只能检查 ZIP 结构、扩展名白/黑名单与入口脚本是否存在，无法证明用户代码绝对安全。真正的代码安全审计仍需后续沙箱化能力（容器隔离、网络限制、产物扫描等）。

### 校验时机

所有通过 `codeVersionId` 参与训练的任务，在 `TrainingExperimentService.createExperiment` / `createVersion` 中调用 `CodeVersionService.requireApprovedForTraining()`：

- 代码模型版本存在且 `READY`
- `approval_status = APPROVED`
- 当前用户有 owner 访问权限

未通过时返回：**代码模型版本未通过准入校验，不能用于训练**，且**不会**创建 K8s Job。

### 审核接口（保留，管理员手动）

```
POST /api/code/version/{codeVersionId}/approve
```

- 权限：后端 `AuthContext.isAdmin()`（roleId 1 或 2）
- 本阶段仅 approve，无 reject API

### 迁移策略（V14）

- 新增列 `code_version.approval_status`，默认 `PENDING`
- 仅种子版本 `code-ver-consistency-test-v1` 设为 `APPROVED`
- 历史上传测试版本保持 `PENDING`，需管理员手动 approve

## APPROVED ≠ 沙箱隔离

`APPROVED`（无论是管理员手动审核还是 `training-check` 自动写入）仅表示**准入校验**（人工或自动确认代码模型包结构、元数据、固定入口满足要求），**不代表**已完成沙箱隔离。

后续仍需：

- 容器隔离（非 root、只读根文件系统、drop capabilities）
- 网络 egress 限制
- CPU/内存/磁盘配额
- 审计日志与产物扫描

Worker 当前已有部分措施（固定命令、ZIP 路径校验、禁止 `.sh`），但不应视为完整沙箱。

## 负向测试

### JUnit（后端校验）

`TrainingCodeVersionSecurityTest`：

- PENDING codeVersion 拒绝
- APPROVED codeVersion 通过
- trainingProfile 不匹配拒绝
- codeVersionId 不存在拒绝
- datasetVersionId 不存在拒绝

`CodeModelZipValidatorTest`：

- 含 `weights/best.pt` 的代码模型包通过
- `.sh` / 无扩展名 / 不支持扩展名 / 路径穿越拒绝

### Worker 脚本（`verify-consistency-security.sh`）

- hyperParams 不能覆盖固定命令
- code.zip 缺少 train 脚本
- zip 路径穿越
- data.zip 缺少 data/

## 前端入口

- **`/task/create`**：K8s 训练主入口，四步向导（代码模型包 → 数据包 → 配置 → 提交）
- **`/task/consistency-upload`**：开发/演示用上传页

上传代码模型包后展示 `approvalStatus`；`PENDING` 时禁用提交；管理员可见「审核通过（测试）」按钮。

## Profile 数据包要求

不同 `trainingProfile` 对 data.zip 内容要求不同，**不要混用**。

### `image_text_consistency_fusion_logreg`（fusion_logreg）

- **只需要**预计算分数文件：`data/*.jsonl`（共 9 个）
- 由 `scripts/training/train_fusion_baseline.py` 按 `pair_id` 合并 global / region / entity 三路分数后训练 LogReg
- **不需要**：`dataset/images`、原始图片、`models/`、`data/splits/`、`data/splits_existing_images/`、`manifest.jsonl` 等
- **不会读取**代码模型包内 `weights/` 下的权重文件

最小数据包示例：

```bash
backend/scripts/build-consistency-fusion-data-min.sh
# 输出: /opt/consistency_test_fusion_data_min.zip（约 3.4MB，9 个 JSONL）
```

完整数据包 `consistency_test_data.zip`（约 177MB）仍可用于该 profile，但 fusion 训练不会读取其中的图片与 splits。

### `text_image_baseline`（预留 / 非当前平台 profile）

- **需要**原始图文对与图片资源，例如 `dataset/images/`、`data/splits_existing_images/` 等
- 用于端到端图文基线训练，**不能**仅依赖 fusion 的 9 个预计算分数文件

当前平台已注册并可执行的 profile 仅为 `image_text_consistency_fusion_logreg`；`text_image_baseline` 在此说明以便区分数据包边界，避免误传最小 fusion 包到需要图片的 profile。
