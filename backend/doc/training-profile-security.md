# 训练 Profile 安全边界与代码审核

## 当前定位

TSS 平台**不是**开放式任意代码执行平台。带 `codeVersionId` 的 profile 训练仅允许：

1. 平台预注册的 `trainingProfile`（当前：`image_text_consistency_fusion_logreg`）
2. Worker 内硬编码的白名单命令（不可通过 `hyperParams` 覆盖）
3. 经管理员审核（`approval_status = APPROVED`）的代码版本

## approval_status（平台级）

| 状态 | 含义 |
| --- | --- |
| `PENDING` | 上传后默认状态，**不可**用于创建训练任务 |
| `APPROVED` | 管理员审核通过，可用于 profile 训练 |
| `REJECTED` | 预留，本阶段无 reject API |

### 校验时机

所有通过 `codeVersionId` 参与训练的任务，在 `TrainingExperimentService.createExperiment` / `createVersion` 中调用 `CodeVersionService.requireApprovedForTraining()`：

- 代码版本存在且 `READY`
- `approval_status = APPROVED`
- 当前用户有 owner 访问权限

未通过时返回：**代码版本未审核通过，不能用于训练**，且**不会**创建 K8s Job。

### 审核接口

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

`APPROVED` 仅表示**准入审核**（人工确认代码包可用于固定 profile 演示/测试），**不代表**已完成沙箱隔离。

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

### Worker 脚本（`verify-consistency-security.sh`）

- hyperParams 不能覆盖固定命令
- code.zip 缺少 train 脚本
- zip 路径穿越
- data.zip 缺少 data/

## 前端 `/task/consistency-upload`

- 上传 code.zip 后展示 `approvalStatus`
- `PENDING` 时禁用「创建训练任务」
- 管理员可见「审核通过（测试）」按钮，调用 approve 接口

## Profile 数据包要求

不同 `trainingProfile` 对 data.zip 内容要求不同，**不要混用**。

### `image_text_consistency_fusion_logreg`（fusion_logreg）

- **只需要**预计算分数文件：`data/*.jsonl`（共 9 个）
- 由 `scripts/training/train_fusion_baseline.py` 按 `pair_id` 合并 global / region / entity 三路分数后训练 LogReg
- **不需要**：`dataset/images`、原始图片、`models/`、`data/splits/`、`data/splits_existing_images/`、`manifest.jsonl` 等

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
