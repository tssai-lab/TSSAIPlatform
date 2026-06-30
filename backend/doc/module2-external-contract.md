# 模块二对外边界契约 v1

## 1. 契约目标

本文档用于稳定模块二对前端、模块一、训练执行模块、推理模块等其他模块暴露的接口边界。

模块二负责：

- 模型资产与模型版本管理。
- 数据集资产与数据集版本管理。
- 模型/数据集分片上传与 MinIO 存储。
- 训练任务/训练实验元数据管理、结果回写和当前本地轻量训练启动。
- 用户资源隔离与文件归属校验。

其他模块应优先通过模块二提供的稳定 ID 引用资源，而不是直接依赖数据库表结构或 MinIO 对象路径。

## 2. 鉴权边界

所有模块二业务接口都依赖模块一登录态：

```http
Authorization: Bearer <token>
```

模块二读取：

```java
StpUtil.getLoginIdAsInt()
StpUtil.getTokenSession().get("roleId")
```

角色规则：

| roleId | 说明 | 模块二权限 |
| --- | --- | --- |
| 1 | super_admin | 可访问全部资源 |
| 2 | admin | 可访问全部资源 |
| 3 | user | 只能访问自己的资源 |

资源隔离字段：

```text
owner_user_id
```

普通用户查询、详情、删除、下载时均按 `owner_user_id` 过滤。管理员不受 owner 限制。

## 3. 统一响应格式

模块二接口统一使用：

```json
{
  "success": true,
  "data": {},
  "errorMessage": null
}
```

失败示例：

```json
{
  "success": false,
  "data": null,
  "errorMessage": "model not found or no permission"
}
```

前端和其他模块判断模块二接口是否成功时，以 `success` 为准。

## 4. 稳定资源 ID

其他模块应使用以下 ID 做跨模块引用：

| ID | 说明 | 稳定性 |
| --- | --- | --- |
| `modelVersionId` | 模型版本 ID，对应模型包和模型元数据 | 稳定 |
| `modelAssetId` / `assetId` | 模型资产 ID，表示同一模型的逻辑集合 | 稳定 |
| `datasetVersionId` | 数据集版本 ID，对应数据集文件和数据集元数据 | 稳定 |
| `datasetAssetId` / `assetId` | 数据集资产 ID，表示同一数据集的逻辑集合 | 稳定 |
| `experimentId` | 训练实验 ID，包含多个实验版本 | 稳定 |
| `trainingVersionId` | 训练实验版本 ID | 稳定 |
| `uploadId` | 上传会话 ID，只在上传流程中有效 | 临时 |

不建议其他模块持久依赖：

```text
storagePath
objectName
MinIO bucket
MinIO endpoint
```

这些属于存储实现细节，后续可调整。

## 5. 模型边界

### 5.1 模型上传

基础路径：

```text
/api/model/upload
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/init` | 初始化上传，返回 `uploadId` 和分片信息 |
| `POST` | `/chunk` | 上传指定分片 |
| `GET` | `/progress` | 查询上传进度 |
| `POST` | `/complete` | 合并分片，生成模型资产和模型版本 |

稳定返回字段：

| 字段 | 说明 |
| --- | --- |
| `uploadId` | 上传会话 ID |
| `id` | 模型版本 ID，也可视为 `modelVersionId` |
| `assetId` | 模型资产 ID |
| `name` | 模型名称 |
| `version` | 模型版本号 |
| `type` | 模型/训练任务类型，`CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT` |
| `remark` | 备注 |
| `fileName` | 原始文件名 |
| `sizeBytes` | 文件大小 |
| `status` | 上传状态 |
| `ownerUserId` | 资源归属用户 ID |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

上传状态可能为 `UPLOADING`、`COMPLETING`、`COMPLETED`。`COMPLETING` 表示服务端正在合并分片；同一个 `uploadId` 并发调用 `/complete` 不会重复生成模型资产/版本。

上传约束：

```text
模型文件只支持 .zip
complete 时 uploadId、modelName、version、type、remark 都不能为空
type 仅支持 CV、NLP、POINT_CLOUD 或 ROBOT
zip 必须是合法且非空的压缩包
zip 内路径可以使用 / 或 \，后端统一规范化为 /；规范化后不能包含绝对路径、盘符、.. 或空字节
zip 条目数不超过 100000，解压后总体积不超过 50GB
```

### 5.2 模型查询

基础路径：

```text
/api/model
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/list` | 查询当前用户可见模型版本列表 |
| `GET` | `/detail?id={modelVersionId}` | 查询模型版本详情 |
| `GET` | `/code-files?id={modelVersionId}` | 查询模型 zip 内可预览代码文件 |
| `GET` | `/previewCode?id={modelVersionId}&path={path}` | 预览模型 zip 内代码文本 |
| `DELETE` | `/delete?id={modelVersionId}` | 删除模型版本及对象文件 |

`/list` 可选 query: `type`, `keyword`, `page`/`current`, `pageSize`。返回体包含 `data`, `total`, `page`, `pageSize`。

模型列表稳定字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 模型版本 ID |
| `name` | 模型名称 |
| `version` | 模型版本号 |
| `type` | `CV` 或 `NLP` |
| `remark` | 备注 |
| `ownerUserId` | 归属用户 |
| `sizeBytes` | 文件大小 |
| `createdAt` | 创建时间 |

说明：当前响应中可能包含 `storagePath`，但其他模块不要将其作为长期契约使用。

## 6. 数据集边界

### 6.1 数据集上传

基础路径：

```text
/api/dataset/upload
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/init` | 初始化数据集分片上传 |
| `POST` | `/chunk` | 上传数据集分片 |
| `GET` | `/progress` | 查询上传进度 |
| `POST` | `/complete` | 合并分片，生成数据集资产和版本 |
| `POST` | `/folder` | 上传 CV 文件夹，服务端打包为 zip |

稳定返回字段：

| 字段 | 说明 |
| --- | --- |
| `uploadId` | 上传会话 ID |
| `id` | 数据集版本 ID，也可视为 `datasetVersionId` |
| `assetId` | 数据集资产 ID |
| `name` | 数据集名称 |
| `version` | 数据集版本号 |
| `datasetVersionId` | 数据集版本 ID，与 `id` 一致 |
| `versionNo` | 后端生成的版本序号 |
| `versionLabel` | 展示版本标签 |
| `description` | 当前版本说明 |
| `changeLog` | 相对父版本的变更说明 |
| `parentVersionId` | 父版本 ID |
| `type` | 数据集任务类型，`CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 或 `MULTIMODAL` |
| `cvTaskType` | CV 子任务类型，非 CV 为 `null` |
| `annotationFormat` | CV 标注格式，非 CV 为 `null` |
| `remark` | 备注 |
| `fileName` | 文件名 |
| `sizeBytes` | 文件大小 |
| `status` / `uploadStatus` | 上传会话状态 |
| `versionStatus` | 数据集版本状态，普通类型完成后为 `READY`，`MULTIMODAL` 完成后为 `DRAFT` |
| `importJobId` / `importStatus` | `MULTIMODAL` 导入任务信息，普通类型为 `null` |
| `ownerUserId` | 资源归属用户 ID |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

上传状态可能为 `UPLOADING`、`COMPLETING`、`COMPLETED`。`COMPLETING` 表示服务端正在合并分片；同一个 `uploadId` 并发调用 `/complete` 不会重复生成数据集资产/版本。

上传约束：

| 类型 | 规则 |
| --- | --- |
| `CV` | 分片上传只支持 zip，`/folder` 可上传图片文件夹；必须至少包含一个图片文件；可按 `annotationFormat` 携带标注文件 |
| `NLP` | 支持 `.txt`、`.json`、`.jsonl`、`.csv`、`.xlsx`、`.xls`、`.pdf`、`.docx`、`.xml`，或仅包含这些文件的 zip |
| `POINT_CLOUD` | 支持单文件 `.ply`、`.pcd`，或仅包含 `.ply`、`.pcd`、`.txt`、`.json`、`.yaml`、`.yml` 且至少包含一个点云文件的 zip |
| `ROBOT` | 支持单文件 `.xml`、`.yaml`、`.yml`，或仅包含 `.xml`、`.yaml`、`.yml`、`.json`、`.txt` 的 zip |
| `MULTIMODAL` | 只支持 zip；`sampleGrouping` 支持 `AUTO_DIRECTORY` 或 `MANIFEST`，未传时默认 `AUTO_DIRECTORY`；完成上传后先创建 `DRAFT` 版本和 `PENDING` ImportJob |

CV 子任务和标注格式：

| 字段 | 默认值 | 支持值 |
| --- | --- | --- |
| `cvTaskType` | `UNLABELED` | `IMAGE_CLASSIFICATION`、`OBJECT_DETECTION`、`SEMANTIC_SEGMENTATION`、`INSTANCE_SEGMENTATION`、`UNLABELED`、`OTHER` |
| `annotationFormat` | `NONE` | `NONE`、`FOLDER_CLASSIFICATION`、`CSV`、`YOLO`、`COCO`、`VOC`、`MASK`、`LABELME`、`OTHER` |

CV 标注文件白名单：

| `annotationFormat` | 允许的非图片文件 | 是否必须包含标注文件 |
| --- | --- | --- |
| `NONE` / `FOLDER_CLASSIFICATION` / `MASK` | 无 | 否 |
| `CSV` | `.csv` | 是 |
| `YOLO` | `.txt`、`.yaml`、`.yml` | 是 |
| `COCO` / `LABELME` | `.json` | 是 |
| `VOC` | `.xml` | 是 |
| `OTHER` | `.txt`、`.json`、`.xml`、`.csv`、`.yaml`、`.yml` | 否 |

zip 附加约束：

```text
zip 内路径可以使用 / 或 \，后端统一规范化为 /；规范化后不能包含绝对路径、盘符、.. 或空字节
限制条目数量不超过 100000，解压后总体积不超过 50GB
```

`MULTIMODAL + MANIFEST` 的 `manifestPath` 以及 manifest JSON 内的 `data[].path`、`annotations[].path`、`annotations[].ref_data_path` 使用同一套 ZIP 路径规则：接受 `/` 或 `\`，统一规范化为 `/`，继续拒绝空路径、绝对路径、Windows 盘符、空字节和 `..`。

`MULTIMODAL` complete 不执行单模态 zip 白名单和全量解压校验；manifest、AUTO_DIRECTORY 目录结构和 ZIP 内容校验由异步 ImportJob 完成。导入成功后版本变为 `READY`，失败后版本保持 `DRAFT`。

### 6.1.1 ImportJob 失败重试

MULTIMODAL 导入失败后，允许对失败任务做受控 FULL 重试：

```http
POST /api/dataset-samples/import/{importJobId}/retry?mode=FULL
```

边界：

- 只支持 `FULL`，不支持 `PARTIAL` 或增量 retry。
- 只允许 `FAILED -> PENDING`，随后由现有 ImportJob launcher 重新调度。
- 重试会清空错误字段并重置进度，但不会清理已落库的半导入样本；若检测到已有样本，会拒绝重试。
- DatasetVersion 在导入成功前仍保持 `DRAFT`。

### 6.1.2 已有数据集维护工作区

已有 READY 数据集可以创建 DRAFT 维护工作区，用于在不修改父 READY 的前提下软删除、恢复和追加数据，最终通过 publish 成为新的 READY 版本并更新 `currentVersionId`。

- `MULTIMODAL` 继续支持 `MANIFEST` 或 `AUTO_DIRECTORY` ZIP 追加。
- ZIP-backed `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 也支持工作区增删和 ZIP 追加；单模态追加必须省略 `sampleGrouping` 和 `manifestPath`，后端按任务类型校验 ZIP 内容，并按 ZIP entry 生成一文件一样本的元数据。
- 没有 package 元数据的 ZIP-backed 单模态旧版本创建 DRAFT 时会把父 ZIP 登记为 `PRIMARY` package，并生成 Sample/Data 元数据，因而可以在工作区删除已有文件。
- 非 ZIP 单模态旧版本不能创建维护工作区；需要重新上传为 ZIP 数据集。
- DRAFT 查询、删除、恢复和发布必须使用 workspace/edit-session 专用接口；普通样本查询仍只承诺 READY 版本。

### 6.2 数据集消费清单

新模块读取数据集内容时，优先使用 V2 只读消费清单：

```http
GET /api/v2/dataset-versions/{datasetVersionId}/consumer-manifest?page=1&pageSize=100
```

该接口只接受调用方有权限访问的 `READY` 数据集版本。返回内容包括：

| 字段 | 说明 |
| --- | --- |
| `datasetVersionId` | 数据集版本 ID |
| `datasetId` | 数据集资产 ID |
| `type` | 数据集类型 |
| `versionLabel` | 版本展示标签 |
| `samples[]` | 样本清单 |
| `samples[].data[]` | 样本数据项及固定 preview/download 链接 |
| `samples[].annotations[]` | 标注项及固定 download 链接 |

该接口不返回 `storagePath`、MinIO objectName、bucket、packageId、ZIP offset、CRC 或数据库内部字段。

训练、推理、评估等模块如果需要枚举样本，应依赖该消费清单或固定 preview/download 接口，不应直接扫描 MinIO 或查询模块二数据库表。

### 6.3 数据集查询

基础路径：

```text
/api/dataset
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/list` | 查询当前用户可见数据集列表 |

`/list` 可选 query: `type`, `keyword`, `page`/`current`, `pageSize`。返回体包含 `data`, `total`, `page`, `pageSize`。未传 `pageSize` 时 legacy V1 返回全部；传入时最大 `200`。

数据集列表稳定字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 数据集资产 ID |
| `assetId` | 数据集资产 ID |
| `versionId` | 当前推荐 READY 数据集版本 ID；没有 READY 时为 `null` |
| `currentVersionId` | 当前推荐 READY 数据集版本 ID；语义与 `versionId` 一致 |
| `name` | 数据集名称 |
| `version` | 当前推荐 READY 版本展示标签 |
| `type` | `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 或 `MULTIMODAL` |
| `cvTaskType` | CV 子任务类型，NLP 为 `null` |
| `annotationFormat` | CV 标注格式，NLP 为 `null` |
| `remark` | 数据集备注 |
| `fileName` | 当前推荐 READY 版本文件名 |
| `sizeBytes` | 当前推荐 READY 版本文件大小 |
| `ownerUserId` | 归属用户 |
| `uploadTime` | 当前推荐 READY 版本上传时间；没有 READY 时回退资产创建时间 |
| `createdAt` | 资产创建时间 |
| `updatedAt` | 资产更新时间 |
| `currentVersionNo` / `currentVersionLabel` | 当前推荐 `READY` 版本的序号和展示标签 |
| `versionStatus` | 当前推荐版本状态；新建 `MULTIMODAL` 只有 DRAFT 时可为 `null` |
| `currentVersionFileCount` / `fileCount` | 当前推荐 READY 版本文件计数；元数据化版本按 Sample Data 与 Annotation 计数，传统 ZIP 按 ZIP 非目录 entry 计数，无法计算时为 `null` |
| `latestDraftVersionId` | 最新未删除 DRAFT 版本 ID |
| `importJobId` / `importStatus` / `importProgress` | 最新 DRAFT 的导入任务展示字段 |

`versionId` / `currentVersionId` 始终指向当前推荐 READY 版本；后端优先使用 `dataset_asset.current_version_id`，不可用时回退到 `versionNo` 最大的 READY 版本。`latestDraftVersionId` 和 `import*` 只用于展示工作区/导入状态，不改变当前 READY 语义。文件数优先读取 `dataset_version.file_count`；旧数据为空时懒计算并回写，计算失败返回 `null`，不阻断列表。

其他模块如果要引用数据集参与训练，应优先使用 `versionId`。

V2 数据集列表：

```text
GET /api/v2/datasets
```

V2 `pageSize` 默认 `20`、最大 `200`，`current` 优先于 `page`。稳定字段如下：

| 字段 | 说明 |
| --- | --- |
| `datasetId` | 数据集资产 ID |
| `name` / `type` | 数据集展示名称和类型 |
| `currentVersion` | 当前 READY 摘要：`versionId`、`versionLabel`、`versionNo`、`status` |
| `currentVersionFileCount` / `fileCount` | 当前 READY 文件数；无当前版本或计数不可用时为 `null` |
| `displayStatus` | `EMPTY`、`READY`、`EDITING`、`IMPORTING` 或 `IMPORT_FAILED` |
| `hasDraft` | 是否存在活动 DRAFT |
| `editSessionId` | 活动 DRAFT ID |
| `importProgress` | 最新导入进度 |
| `canPublish` | 是否可发布当前 DRAFT |
| `availableActions` | `VIEW`、`PREVIEW`、`EDIT`、`ADD_DATA`、`PUBLISH` 的可用子集 |
| `userError` | 导入失败时的结构化用户错误 |

V2 不返回 `storagePath`、`ownerUserId`、`currentVersionId`、`latestDraftVersionId`、`importJobId`、MinIO objectName 或 ZIP offset。

## 7. 训练实验边界

训练任务和训练实验不是纯元数据管理：创建实验首个版本或实验新版本后，当前代码会在事务提交后异步启动 `TrainingExecutorRouter`。不带 `trainingProfile` 的兼容任务走本地 runner；带 `trainingProfile` 的任务走 K8s profile 训练路径，要求训练代码版本已准入。

当前本地 runner 只解析数据集 zip 中的图片和路径包含 `labels/` 的 YOLO `.txt` 标签，并写回 `running`、`success` 或 `failed` 结果。模型/数据集类型校验通过，不代表所有数据集类型或标注格式都能被当前本地 runner 成功训练。

当前 profile 训练只支持 `image_text_consistency_fusion_logreg`。该路径会校验基础模型权重版本、训练数据集版本、训练代码版本和 `trainingProfile` 的匹配关系；Worker 使用固定 profile 命令，`hyperParams` 只作为记录和传递字段，不能覆盖固定训练命令。

兼容路径：

```text
/api/task
/api/experiments
```

训练代码资产接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/code/upload` | 上传训练代码 ZIP，生成 `codeAssetId` 和 `codeVersionId` |
| `GET` | `/api/code/version/list` | 查询当前用户可用于训练的 `READY` + `APPROVED` 代码版本 |
| `POST` | `/api/code/version/{codeVersionId}/approve` | 手工批准代码版本 |
| `GET` | `/api/code/version/{codeVersionId}/training-check?trainingProfile=...` | 按训练方案做代码包结构准入检查；通过后自动置为 `APPROVED` |

代码包准入只代表路径、扩展名、固定入口和 profile 元数据检查通过，不代表完成代码安全审计。

### 7.1 训练任务接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/task/create` | 创建训练任务，生成实验首个版本 |
| `GET` | `/api/task/list` | 查询当前用户可见训练任务 |
| `GET` | `/api/task/detail?id={id}` | 查询训练任务详情 |
| `POST` | `/api/task/stop?id={id}` | 停止训练任务 |
| `POST` | `/api/task/result?id={id}` | 回写训练结果，`id` 可为训练版本 ID 或实验 ID |
| `DELETE` | `/api/task/delete?id={id}` | 删除训练实验 |

创建训练任务请求稳定字段：

| 字段 | 说明 |
| --- | --- |
| `name` | 实验名称，可选 |
| `modelVersionId` | 兼容模型版本 ID；未传 `baseModelVersionId` 时作为基础模型权重版本使用 |
| `baseModelVersionId` | 基础模型权重版本 ID；带 `trainingProfile` 时必填，可与 `modelVersionId` 二选一，二者同时传入时必须一致 |
| `datasetVersionId` | 数据集版本 ID，必填 |
| `codeVersionId` | 训练代码版本 ID，必填 |
| `trainingProfile` | 训练方案 ID；不传走 legacy 本地训练路径，传入时进入 profile/K8s 路径 |
| `hyperParams` / `params` | 超参数 JSON；legacy 路径必填，profile 路径不传时按 `{}` 记录 |
| `remark` | 备注，可选 |

创建时后端会校验数据集版本存在且调用方可访问，数据集版本为 `READY` 且具备 `storagePath`。不带 `trainingProfile` 的 legacy 路径会校验模型类型与数据集类型一致，`codeVersionId` 仍只做非空校验。带 `trainingProfile` 的 profile 路径会额外校验基础模型权重版本存在且有 `storagePath`、代码版本存在且为 `READY` + `APPROVED`、代码资产 `trainingProfile` 与请求一致，并校验数据集类型符合该 profile 要求。

返回稳定字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 训练实验版本 ID |
| `experimentId` | 实验 ID |
| `versionNo` | 实验版本号 |
| `name` | 实验名称 |
| `modelVersionId` | 模型版本 ID |
| `baseModelVersionId` | 基础模型权重版本 ID；当前与 `modelVersionId` 相同 |
| `codeVersionId` | 代码版本 ID |
| `trainingProfile` | 训练方案 ID；legacy 任务为空 |
| `datasetVersionId` | 数据集版本 ID |
| `hyperParams` | 超参数 JSON |
| `status` | 训练状态 |
| `progress` | 展示进度 |
| `metrics` | 指标 JSON |
| `runId` | MLflow 或外部执行器运行 ID |
| `logPath` | 日志路径 |
| `outputPath` | 输出路径 |
| `errorMessage` | 失败信息 |
| `startedAt` | 开始时间 |
| `finishedAt` | 结束时间 |
| `remark` | 备注 |
| `ownerUserId` | 归属用户 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

### 7.2 实验版本接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/experiments` | 创建实验，等价于 `/api/task/create` |
| `GET` | `/api/experiments/{experimentId}/versions` | 查询实验版本历史 |
| `GET` | `/api/experiments/{experimentId}/versions/{versionNo}` | 查询指定实验版本 |
| `POST` | `/api/experiments/{experimentId}/versions` | 基于已有实验创建新版本 |
| `PUT` | `/api/experiments/{experimentId}/versions/{versionNo}/hyper-parameters` | 更新超参数 |
| `PUT` | `/api/experiments/{experimentId}/versions/{versionNo}/result` | 按实验 ID 和版本号精确回写训练结果 |

训练状态约定：

| 状态 | 说明 |
| --- | --- |
| `pending` | 已创建，等待训练 |
| `queued` | 预留，进入队列 |
| `running` | 训练中 |
| `success` | 训练成功 |
| `failed` | 训练失败 |
| `stopped` | 已停止 |

创建接口先返回 `pending`；当前本地 runner 会异步写入 `running`、`success` 或 `failed`；停止接口写入 `stopped`；结果回写接口允许上述状态集合。

## 8. 文件边界

基础路径：

```text
/api/files
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | MinIO 健康检查，仍受 `/api/**` 登录拦截 |
| `POST` | `/upload` | 通用文件上传 |
| `GET` | `/download?objectName=...` | 下载文件 |
| `DELETE` | `/delete?objectName=...` | 删除文件 |

通用文件接口主要用于调试或辅助能力。业务模块优先通过模型/数据集版本 ID 引用文件。

普通用户上传相对 `objectName` 时，后端会返回归一化后的对象名：

```text
users/{当前用户ID}/files/{objectName}
```

如果请求已经传入 `users/{当前用户ID}/...` 前缀，则保持该前缀下路径。对象名会拒绝控制字符、`.`、`..`、绝对路径等不安全片段。

普通用户只能访问：

```text
users/{当前用户ID}/...
```

管理员可访问全部对象。

## 9. 对其他模块的集成规则

### 9.1 模块一

模块一提供：

```text
token
userId
roleId
```

模块二不复制用户表、不维护独立角色体系。

### 9.2 前端

前端应：

- 所有模块二业务请求都带 `Authorization: Bearer <token>`。
- 判断响应时使用 `success`。
- 训练创建时提交 `modelVersionId` 和 `datasetVersionId`。
- 不直接拼接或持久依赖 MinIO 对象路径。

### 9.3 训练执行模块

训练执行模块应以训练实验为入口：

```text
experimentId
versionNo
modelVersionId
datasetVersionId
codeVersionId
hyperParams
ownerUserId
```

训练执行模块不应绕过模块二直接扫描 MinIO。需要文件时，应先通过模型版本 ID、数据集版本 ID 获取元数据，再由后端内部服务读取对象。

### 9.3.1 数据集交付与训练适配边界

模块二向训练执行模块交付的是 READY `datasetVersionId` 和只读 consumer manifest。

模块二不承诺当前训练 runner 能解析所有数据集类型或所有标注格式。当前 `MULTIMODAL` 数据集只能作为数据资产交付给训练团队，不能直接调用 `/api/task/create` 进入现有训练创建流程。

训练团队不得依赖 `storagePath`、MinIO objectName、ZIP offset 或数据库表结构。若训练侧要支持 `MULTIMODAL`，应由训练侧基于 READY `datasetVersionId` 调用 consumer manifest，并自行完成 batch 组装、数据选择和模型/数据集适配策略。

训练版本 DTO 当前已返回执行结果字段：

```text
runId
metrics
logPath
outputPath
startedAt
finishedAt
errorMessage
```

### 9.4 推理模块

推理模块应引用：

```text
modelVersionId
```

不要直接引用：

```text
storagePath
MinIO objectName
```

这样后续模型存储迁移、路径调整或权限规则变化时，不影响推理模块契约。

## 10. 兼容性规则

模块二 v1 契约遵循：

- 可以新增响应字段。
- 不删除或重命名本文档标记为稳定的字段。
- 不改变稳定 ID 的含义。
- 不改变普通用户只能访问自己资源、管理员可访问全部资源的规则。
- 不要求其他模块直接访问 MinIO。
- 若需要破坏性变更，应新增接口版本或新增兼容字段，保留旧字段一段时间。

## 11. 当前内部实现，不作为外部契约

### 11.1 Legacy 与 V2 调用边界

Legacy 接口可能继续返回兼容字段，例如 `storagePath`、`importJobId`、`latestDraftVersionId`。这些字段只服务现有页面兼容，不作为新模块的稳定集成契约。

新模块必须优先使用 V2 数据集列表、V2 预览 descriptor 和 consumer manifest。需要文件内容时，通过 consumer manifest 返回的固定 preview/download 链接访问。

以下内容属于内部实现细节：

- JPA 实体字段完整结构。
- Repository 方法名称。
- MinIO bucket 名称。
- MinIO objectName 具体拼接规则。
- 上传临时分片对象路径。
- `storagePath` 的长期格式。
- 数据库表名和索引名。

其他模块不应直接依赖这些细节。

## 12. 当前可交付边界

当前模块二可对外承诺：

```text
模型版本 ID
数据集版本 ID
READY 数据集消费清单
FAILED ImportJob FULL retry
训练实验 ID
训练实验版本 ID
owner_user_id 资源隔离
模型/训练任务类型 CV/NLP/POINT_CLOUD/ROBOT
数据集任务类型 CV/NLP/POINT_CLOUD/ROBOT/MULTIMODAL
pending/running/success/failed/stopped 训练状态语义
Authorization: Bearer <token> 鉴权方式
ApiResponse 响应格式
```

这就是模块二 v1 的稳定对外边界。
