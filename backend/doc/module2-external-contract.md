# 模块二对外边界契约 v1

## 1. 契约目标

本文档用于稳定模块二对前端、模块一、训练执行模块、推理模块等其他模块暴露的接口边界。

模块二负责：

- 模型资产与模型版本管理。
- 数据集资产与数据集版本管理。
- 代码资产、在线编辑工作区、不可变代码版本、校验与审批证据管理。
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
| 1 | super_admin | 通常可访问全部资源；V2 代码源码仍为 owner-only，仅显式审批/恢复端点开放管理员能力 |
| 2 | admin | 通常可访问全部资源；V2 代码源码仍为 owner-only，仅显式审批/恢复端点开放管理员能力 |
| 3 | user | 只能访问自己的资源 |

资源隔离字段：

```text
owner_user_id
```

普通用户查询、详情、删除、下载时均按 `owner_user_id` 过滤。模型、数据集等既有接口中的管理员通常不受 owner 限制；V2 代码资产、版本、工作区及源码读取是例外，始终按当前用户过滤，跨用户统一返回 `404`。管理员仅能通过显式的审批和历史制品恢复接口执行管理操作，且权限检查先于资源查询。

## 3. 统一响应格式

Legacy 模块二接口主要使用 `ApiResponse<T>`：

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

调用 Legacy 接口时以前述 `success` 为准。V2 代码资产接口（`/api/v2/code-assets/**`、`/api/v2/code-workspaces/**`、`/api/v2/code-versions/**`）成功时直接返回 DTO、列表或文件流，不包裹 `ApiResponse`；JSON 失败响应使用 `V2ErrorResponse`：

```json
{
  "success": false,
  "errorCode": "CODE_ASSET_CONFLICT",
  "errorMessage": "code asset conflict",
  "details": {
    "reasonCode": "WORKSPACE_REVISION_CONFLICT"
  },
  "traceId": "..."
}
```

V2 代码接口使用真实 HTTP 状态：`403` 表示管理员能力不足，`404` 隐藏不存在或跨用户资源，`409` 表示并发或生命周期冲突，`413` 表示超出在线内容上限，`422` 表示校验失败，`503` 表示制品存储暂不可用。

## 4. 稳定资源 ID

其他模块应使用以下 ID 做跨模块引用：

| ID | 说明 | 稳定性 |
| --- | --- | --- |
| `modelVersionId` | 模型版本 ID，对应模型包和模型元数据 | 稳定 |
| `modelAssetId` / `assetId` | 模型资产 ID，表示同一模型的逻辑集合 | 稳定 |
| `datasetVersionId` | 数据集版本 ID，对应数据集文件和数据集元数据 | 稳定 |
| `datasetAssetId` / `assetId` | 数据集资产 ID，表示同一数据集的逻辑集合 | 稳定 |
| `codeAssetId` / `assetId` | 代码资产 ID，表示同一代码资产的逻辑集合 | 稳定 |
| `codeVersionId` / `versionId` | 已发布、不可变代码版本 ID | 稳定 |
| `codeWorkspaceId` / `workspaceId` | 代码编辑工作区 ID，只在草稿生命周期中有效 | 临时 |
| `artifactSha256` | 已发布代码制品原始字节的 SHA-256 证据 | 版本级稳定证据 |
| `experimentId` | 训练实验 ID，包含多个实验版本 | 稳定 |
| `trainingVersionId` | 训练实验版本 ID | 稳定 |
| `uploadId` | 上传会话 ID，只在上传流程中有效 | 临时 |
| `importJobId` | 初始导入或 APPEND ImportJob ID；V2 中用于查询、FULL 重试 FAILED 导入和 INCREMENTAL 重试 PARTIAL 导入 | 业务句柄 |

不建议其他模块持久依赖：

```text
storagePath
objectName
MinIO bucket
MinIO endpoint
packageId
minio_delete_task id
scheduler_lock row
```

这些属于存储或后台调度实现细节，后续可调整。

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
| `MULTIMODAL` | 只支持 zip；`sampleGrouping` 支持 `AUTO_DIRECTORY` 或 `MANIFEST`，未传时默认 `AUTO_DIRECTORY`；`strictManifest=true` 仅支持 `MANIFEST`；完成上传后先创建 `DRAFT` 版本和 `PENDING` ImportJob |

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

`strictManifest` 为可选字段，默认 `false`。宽松模式下未被 manifest 声明的普通 ZIP entry 只产生 warning，不中断导入；`strictManifest=true` 时，任一未声明普通 ZIP entry 都会使 ImportJob 失败，错误码为 `INVALID_MANIFEST_UNDECLARED_ENTRY`，V2 `userError` 透出对应用户错误。该字段不支持 `AUTO_DIRECTORY` 或单模态上传。

`MULTIMODAL` complete 不执行单模态 zip 白名单和全量解压校验；manifest、AUTO_DIRECTORY 目录结构和 ZIP 内容校验由异步 ImportJob 完成。导入全部成功后版本变为 `READY`；任务级失败或 0 个样本成功时 ImportJob 为 `FAILED`，版本保持 `DRAFT`；部分成功时 ImportJob 为 `PARTIAL`，成功样本保留在 DRAFT 工作区，但该版本不可 publish，不能进入 READY 查询或训练消费。

### 6.1.1 ImportJob 失败重试

MULTIMODAL 导入失败后，允许对失败任务做受控重试：

```http
POST /api/dataset-samples/import/{importJobId}/retry?mode=FULL
POST /api/v2/import-jobs/{importJobId}/retry?mode=FULL
POST /api/dataset-samples/import/{importJobId}/retry?mode=INCREMENTAL
POST /api/v2/import-jobs/{importJobId}/retry?mode=INCREMENTAL
```

边界：

- 只支持 `FULL` 和 `INCREMENTAL` 两种 mode；`PARTIAL` 或未知 mode 会被拒绝。
- `FULL` 只允许 `FAILED -> PENDING`，随后由现有 ImportJob launcher 重新调度；FULL 不扩展到 `PARTIAL`。
- `FULL` 会清空错误字段并重置进度，但不会清理已落库的半导入样本；若检测到已有样本，会拒绝重试。
- `INCREMENTAL` 只允许 `PARTIAL -> PENDING`，只重跑 failure 表中未解决样本，复用 failure row 保存的 `externalId` 和原始 `sampleIndex`，不重新计算 sampleIndex。
- 0 个样本成功的导入仍为 `FAILED`，不能走 `INCREMENTAL`。
- DatasetVersion 在导入成功前仍保持 `DRAFT`；重试要求对应 DatasetVersion 仍为 `DRAFT`，且同版本不存在其他 `PENDING` 或 `RUNNING` ImportJob。
- V2 `importJobId` 是用户侧重试句柄，不是存储路径、owner 标识或 MinIO objectName；无权限或不存在时重试端点返回 404 语义。

V2 重试返回稳定字段：

| 字段 | 说明 |
| --- | --- |
| `importJobId` | 被重试的导入任务句柄 |
| `status` | ImportJob 原始状态 |
| `displayStatus` | V2 展示状态：`IMPORTING`、`IMPORT_FAILED`、`IMPORT_PARTIAL` 或 `READY` |
| `importProgress` | 当前导入进度 |
| `totalSamples` / `importedSamples` / `failedSamples` | 导入样本计数；`failedSamples` 来自未解决 failure row |
| `retryable` / `retryModes` | 是否可由用户重试；`PARTIAL` 返回 `["INCREMENTAL"]` |
| `userError` | 重试后仍失败时的结构化用户错误；非失败状态为 `null` |

V2 重试错误语义：

| HTTP | `errorCode` | 场景 |
| --- | --- | --- |
| `404` | `IMPORT_JOB_NOT_FOUND` | `importJobId` 不存在或调用方无权访问 |
| `422` | `IMPORT_JOB_NOT_RETRYABLE` | mode 与任务状态不匹配、版本不是 `DRAFT`、FULL retry 已存在导入样本、INCREMENTAL 无未解决失败样本、或同版本仍有活动 ImportJob |
| `400` | `INVALID_IMPORT_JOB_RETRY` | `importJobId` 为空或请求格式不合法 |

### 6.1.2 已有数据集维护工作区

已有 READY 数据集可以创建 DRAFT 维护工作区，用于在不修改父 READY 的前提下软删除、恢复和追加数据，最终通过 publish 成为新的 READY 版本并更新 `currentVersionId`。

- `MULTIMODAL` 继续支持 `MANIFEST` 或 `AUTO_DIRECTORY` ZIP 追加。
- ZIP-backed `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 也支持工作区增删和 ZIP 追加；单模态追加必须省略 `sampleGrouping`、`manifestPath` 和 `strictManifest`，后端按任务类型校验 ZIP 内容，并按 ZIP entry 生成一文件一样本的元数据。
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

跨版本按场景 ID 查询时，可以使用数据管理侧 externalId 查询：

```http
GET /api/dataset-samples/multimodal?externalId=scene-001&datasetVersionIds=version-1&datasetVersionIds=version-2&page=1&pageSize=20
GET /api/v2/dataset-samples/multimodal?externalId=scene-001&datasetVersionIds=version-1,version-2&page=1&pageSize=20
```

该查询只接受 `READY`、`deleted=false` 且调用方有权访问的 DatasetVersion。每个 `datasetVersionId` 都会回溯到 `DatasetAsset.ownerUserId` 做权限判断；任一版本不存在、无权限、已删除或不是 READY 时，整个查询失败，错误语义统一为“不存在或无权访问”，不暴露是哪一个 versionId 失败。

成功结果按 `datasetVersionId ASC, sampleIndex ASC, createdAt ASC, id ASC` 稳定分页，只返回 `datasetVersionId`、`sampleId`、`externalId`、`sampleIndex`、`data`、`annotations` 以及固定 preview/download 链接；不返回 `storagePath`、MinIO objectName、bucket、packageId、ZIP offset、CRC 或数据库内部字段。该接口只负责数据管理侧查找，不做训练 batch 组装、样本选择策略、模型匹配或 TaskType 扩展。

### 6.2.1 当前非稳定契约
- workspace 审计日志已实现，legacy 路径为 `GET /api/dataset-versions/{datasetVersionId}/workspace/audit-logs`，V2 路径为 `GET /api/v2/dataset-versions/{datasetVersionId}/workspace/audit-logs`。该接口做 owner 权限校验，但 `operation`、`targetId`、`packageId`、`sampleId`、`details` 等字段只用于模块二内部回溯，不属于训练、推理或其他模块稳定集成契约。
- workspace 审计日志不记录也不返回 `storagePath`、MinIO objectName、bucket 或 ZIP offset；不得用于推导物理文件位置或驱动 publish、retry、清理等业务状态。
- package 引用感知物理清理已在模块二内部实现 dry-run 与显式安全入队；默认不删除，只有 `canDelete=true` 时写入 `MinioDeleteTask`，且不会直接调用 MinIO delete。该能力当前不作为训练、推理或其他外部模块稳定契约；外部仍只应依赖软删除状态、READY `datasetVersionId` 和 consumer manifest。

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
| `displayStatus` | `EMPTY`、`READY`、`EDITING`、`IMPORTING`、`IMPORT_FAILED` 或 `IMPORT_PARTIAL` |
| `hasDraft` | 是否存在活动 DRAFT |
| `editSessionId` | 活动 DRAFT ID |
| `importProgress` | 最新导入进度 |
| `canPublish` | 是否可发布当前 DRAFT |
| `availableActions` | `VIEW`、`PREVIEW`、`EDIT`、`ADD_DATA`、`PUBLISH` 的可用子集 |
| `userError` | 导入失败时的结构化用户错误 |

V2 数据集列表不返回 `storagePath`、`ownerUserId`、`currentVersionId`、`latestDraftVersionId`、MinIO objectName 或 ZIP offset。

`canPublish=true` 仅在 DRAFT 有未删除样本、ImportJob 均为 `SUCCESS` 或 `SUPERSEDED`、package 均为 `READY` 或 `SUPERSEDED` 时返回；`PARTIAL` ImportJob 或 `PARTIAL` package 一律不可 publish。

V2 上传和编辑会话 DTO 会返回 `importJobId`，用于导入失败后的 V2 重试：

| DTO / 接口 | 字段 | 说明 |
| --- | --- | --- |
| `V2DatasetUploadDto`：`POST /api/v2/dataset-uploads/{uploadId}/complete`、`GET /api/v2/dataset-uploads/{uploadId}` | `importJobId` | 当前上传触发的 ImportJob 重试句柄；普通非导入上传或尚未创建任务时为 `null` |
| `V2DatasetEditSessionDto`：`GET /api/v2/dataset-edit-sessions/{editSessionId}` | `importJobId` | 当前编辑会话的导入任务句柄；若最新任务仍为 `PENDING`/`RUNNING` 则返回最新活动任务，否则优先返回最新未解决 `PARTIAL`/`FAILED` 任务作为发布阻塞和重试句柄；没有导入任务时为 `null` |
| `V2ImportJobStatusDto`：`GET /api/v2/import-jobs/{importJobId}`、`POST /api/v2/import-jobs/{importJobId}/retry?mode=FULL`、`POST /api/v2/import-jobs/{importJobId}/retry?mode=INCREMENTAL` | `importJobId` | 被查询或重试的 ImportJob 句柄，供调用方继续轮询上传或编辑会话状态；`PARTIAL` 仅返回 `retryModes=["INCREMENTAL"]` |

调用方只能使用自己有权限访问的 `importJobId` 调用 V2 重试端点；无权限或不存在按 404 处理。`importJobId` 不允许被当作数据库外键、存储路径或跨资源枚举入口。

workspace 审计日志的 V2 查询路径为：

```http
GET /api/v2/dataset-versions/{datasetVersionId}/workspace/audit-logs?page=1&pageSize=20
```

该路径只面向模块二内部工作区回溯，返回字段不作为训练执行模块、推理模块或前端以外新模块的稳定契约。训练侧仍应只依赖 READY `datasetVersionId`、consumer manifest 以及固定 preview/download 链接。

## 7. 代码资产与训练实验边界

### 7.1 V2 代码资产管理

代码资产的稳定生命周期为：

```text
CodeAsset -> CodeWorkspace（可变草稿） -> CodeVersion（不可变版本）
          -> ValidationRun（SHA 绑定校验证据） -> ApprovalRecord（管理员审批证据）
```

V2 代码资源按以下稳定路径分组：

| 资源 | 稳定路径与能力 |
| --- | --- |
| 资产 | `POST/GET /api/v2/code-assets`、`POST /api/v2/code-assets/import`、`GET/PATCH /api/v2/code-assets/{assetId}`、版本列表和工作区列表/创建 |
| 工作区 | `GET /api/v2/code-workspaces/{workspaceId}`、目录树、文件内容/下载/写入/移动/删除、`validate`、`publish`、`abandon` |
| 版本 | `GET /api/v2/code-versions/{versionId}`、目录树、文件内容/下载、完整 ZIP、`consumer-manifest`、`validate`、`approval`、`artifact-upgrade`、`deprecate`、`archive` |

资产、版本和工作区的普通读取与编辑都是 owner-only；跨用户访问按 `404 / CODE_ASSET_NOT_FOUND` 处理。已发布版本不可修改，继续编辑必须创建基于版本的工作区。工作区写、移动、删除、校验、发布和放弃必须使用 `expectedWorkspaceRevision` 做 CAS；已有文件的修改、移动和删除还必须携带匹配的 `expectedContentHash`，新建文件不传内容哈希，冲突为 `409 / CODE_ASSET_CONFLICT`。

在线文件仅支持 `.py`、`.json`、`.jsonl`、`.yaml`、`.yml`、`.txt`、`.md`。后端返回 `python`、`json`、`yaml`、`markdown` 或 `plaintext` 形式的 `languageId`，前端据此选择 Monaco Editor 高亮器；后端不返回高亮 HTML，也不执行源码。在线内容必须是 UTF-8 且原始字节不超过 `1,048,576` bytes；大文件仍可列出和下载，但内容接口返回 `413 / CODE_CONTENT_TOO_LARGE`。`contentHash` 针对原始字节计算，不规范化 BOM 或换行。

代码版本生命周期状态为 `READY / DEPRECATED / ARCHIVED`，校验状态为 `NOT_RUN / PASSED / FAILED`，审批状态为 `PENDING / APPROVED / REJECTED / REVOKED`。校验只生成与当前制品 SHA、策略版本绑定的证据，不自动审批；审批是独立管理员动作。Legacy `/api/code/version/{codeVersionId}/training-check` 同样只校验，`/approve` 仅管理员可用，并要求当前 SHA 对应最新且通过的校验证据。

资产 `trainingProfile` 在还没有未删除代码版本时可改；首个版本产生后，改为不同值或置空返回 `409`，`details.reasonCode=TRAINING_PROFILE_IMMUTABLE`。每个版本保存发布时的 profile 快照，`consumer-manifest` 只从不可变版本返回 `assetId`、`versionId`、用途、运行时、入口脚本、训练类型、`trainingProfile`、`artifactSha256`、校验策略和审批证据，不返回 `storagePath`、MinIO 参数或下载 URL。

内部 `CodeArtifactResolver` 每次解析都会实际读取对象，并核对 objectName、SHA-256 和长度；数据库引用、实际 SHA 或实际长度不一致时拒绝消费。通用 `/api/files` 写入和删除接口也不能操作归一化后的 `users/{owner}/codes` 及其后代，防止绕过版本服务修改或删除制品。

`POST /api/v2/code-versions/{versionId}/artifact-upgrade` 是管理员对单个历史版本的恢复操作：它只接受精确符合旧规则的来源路径，复制到唯一 canonical 对象，核对实际字节、SHA 和长度后原子更新证据，并对失败上传做补偿清理。恢复成功会重新校验但保持 `PENDING`，必须再单独审批；响应不暴露新旧存储路径。已经 canonical 且证据一致的重试是幂等操作。

### 7.2 当前训练兼容边界

本节描述现有训练调用兼容行为，不表示本次代码资产改动修改了训练执行器。训练任务和训练实验不是纯元数据管理：创建实验首个版本或实验新版本后，当前代码会在事务提交后异步启动 `TrainingExecutorRouter`。不带 `trainingProfile` 的兼容任务走本地 runner；带 `trainingProfile` 的任务走 K8s profile 训练路径，要求训练代码版本已准入。

当前本地 runner 只解析数据集 zip 中的图片和路径包含 `labels/` 的 YOLO `.txt` 标签，并写回 `running`、`success` 或 `failed` 结果。模型/数据集类型校验通过，不代表所有数据集类型或标注格式都能被当前本地 runner 成功训练。

当前 profile 训练只支持 `image_text_consistency_fusion_logreg`。该路径会校验基础模型权重版本、训练数据集版本、训练代码版本和冻结后的资产 `trainingProfile` 的匹配关系；Worker 使用固定 profile 命令，`hyperParams` 只作为记录和传递字段，不能覆盖固定训练命令。模块二面向新消费者的稳定契约仍以代码版本快照和 `consumer-manifest` 为准。

兼容路径：

```text
/api/task
/api/experiments
```

Legacy 代码资产路径：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/code/upload` | 上传训练代码 ZIP，生成 `codeAssetId` 和 `codeVersionId` |
| `GET` | `/api/code/version/list` | 查询当前用户可用于训练的 `READY` + `APPROVED` 代码版本 |
| `POST` | `/api/code/version/{codeVersionId}/approve` | 管理员独立批准当前 SHA 已通过校验的版本 |
| `GET` | `/api/code/version/{codeVersionId}/training-check?trainingProfile=...` | 校验代码包结构并刷新校验证据；不会自动批准 |

代码包准入只代表路径、扩展名、固定入口和 profile 元数据检查通过，不代表完成代码安全审计，也不等于管理员审批。

### 7.3 训练任务接口

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

创建时后端会校验数据集版本存在且调用方可访问，数据集版本为 `READY` 且具备 `storagePath`。不带 `trainingProfile` 的 legacy 路径会校验模型类型与数据集类型一致，`codeVersionId` 仍只做非空校验。带 `trainingProfile` 的当前兼容路径会额外校验基础模型权重版本存在且有 `storagePath`、代码版本存在且为 `READY` + `APPROVED`、冻结后的代码资产 `trainingProfile` 与请求一致，并校验数据集类型符合该 profile 要求；新消费者应以代码版本快照为准。

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

### 7.4 实验版本接口

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

通用文件接口主要用于调试或辅助能力。业务模块优先通过模型、数据集或代码版本 ID 引用文件。

普通用户上传相对 `objectName` 时，后端会返回归一化后的对象名：

```text
users/{当前用户ID}/files/{objectName}
```

如果请求已经传入 `users/{当前用户ID}/...` 前缀，则保持该前缀下路径。对象名会拒绝控制字符、`.`、`..`、绝对路径等不安全片段。

普通用户只能访问：

```text
users/{当前用户ID}/...
```

管理员通常可访问全部对象，但所有角色都不能通过通用上传或删除接口操作归一化后的 `users/{owner}/codes` 或其任意后代；该命名空间由代码资产服务独占管理。`GET /download` 保持只读兼容，普通 `users/{owner}/files/**` 行为不变。

### 8.1 MinIO 启动初始化与删除清理

启动阶段会通过 `ApplicationRunner` 确保配置 bucket 存在。该流程默认最多尝试 30 次，初始退避 1000 ms，指数退避上限 30 秒。网络超时、MinIO 暂未就绪等运行期异常会重试；`InvalidBucketName`、`InvalidAccessKeyId`、`SignatureDoesNotMatch`、`AccessDenied` 会快速失败。bucket 参数构造在重试循环前完成，因此非法 bucket 名称会在循环前失败，不会进入退避重试。

删除接口、模型版本删除、数据集版本删除和失败 DRAFT 清理只把对象加入异步 MinIO 删除任务；业务接口返回成功不等于物理对象已删除。删除任务当前语义：

- 目标对象已不存在时按成功处理。
- `PROCESSING` 超过 30 分钟会重置为 `PENDING`。
- 默认单轮最多 5 次尝试；FAILED 后最多 2 次失败重置，每次重置清空单轮 `retryCount` 并递增跨轮 `failedResetCount`，因此默认最多 15 次删除尝试。
- 超过有界重试后任务保持 `FAILED`，需要运维介入或重新创建删除任务。
- 删除任务表、任务 ID、调度锁和具体执行线程池不作为外部集成契约。

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
- Legacy 接口按 `ApiResponse.success` 判断；V2 代码接口按真实 HTTP 状态和 `V2ErrorResponse.errorCode/details.reasonCode` 处理。
- 训练创建时提交 `modelVersionId` 和 `datasetVersionId`。
- 代码编辑器保存 `codeAssetId`、`workspaceId`、`codeVersionId`、workspace revision 和内容哈希；以 `languageId` 配置 Monaco Editor，不要求后端生成高亮 HTML。
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

训练执行模块不应绕过模块二直接扫描 MinIO。需要文件时，应先通过模型版本 ID、数据集版本 ID 获取元数据，再由后端内部服务读取对象。代码制品应按 `codeVersionId` 使用 `consumer-manifest` 和内部解析器；不得依赖 JPA 实体或 MinIO 路径。解析器只有在版本状态和校验/审批证据满足调用要求，且实际对象名、SHA-256、长度均与版本证据一致时才交付制品。本条是模块二提供的消费边界，不声明现有训练执行器已完成统一解析器改造。

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
- 不改变普通用户只能访问自己资源的规则；管理员权限按资源显式定义，V2 代码源码读取仍为 owner-only，审批和历史制品恢复仅通过专用管理员端点开放。
- 不要求其他模块直接访问 MinIO。
- 若需要破坏性变更，应新增接口版本或新增兼容字段，保留旧字段一段时间。

历史代码版本的旧批准状态不等价于当前 SHA 的有效审批证据。历史恢复必须按“单版本 `artifact-upgrade` -> 重新校验 -> 管理员单独审批”执行；恢复和校验均不得自动批准。

## 11. 当前内部实现，不作为外部契约

### 11.1 Legacy 与 V2 调用边界

Legacy 接口可能继续返回兼容字段，例如 `storagePath`、`latestDraftVersionId`。这些字段只服务现有页面兼容，不作为新模块的稳定集成契约；V2 代码 DTO、`consumer-manifest` 和 `artifact-upgrade` 响应永不返回存储路径。`importJobId` 已在 V2 中重分类为导入状态查询和失败重试句柄，稳定暴露于 V2 上传、编辑会话、状态查询和重试结果；新模块应优先使用 `GET /api/v2/import-jobs/{importJobId}`、`POST /api/v2/import-jobs/{importJobId}/retry?mode=FULL` 或 `POST /api/v2/import-jobs/{importJobId}/retry?mode=INCREMENTAL`，而不是 Legacy retry 路径。

新模块必须优先使用 V2 数据集列表、V2 预览 descriptor 和 consumer manifest。需要数据集文件内容时，通过 consumer manifest 返回的固定 preview/download 链接访问。代码消费者必须优先使用 V2 代码版本 ID、代码 `consumer-manifest` 和内部 `CodeArtifactResolver`，不能把 Legacy `storagePath` 当作契约。

### 11.2 后台调度与分布式锁

ImportJob 恢复、上传会话恢复、MinIO 删除任务和数据集生命周期维护均使用数据库分布式锁，锁由同一 owner 在任务结束时条件释放；如果执行实例崩溃，则依赖 `lockedUntil` 过期兜底。启动恢复路径也走对应的加锁方法，避免多实例启动时绕过调度锁。

当前锁的最大持有窗口是内部实现参数：ImportJob 恢复、上传恢复和 MinIO 删除任务为 55 秒，数据集生命周期维护为 55 分钟。外部模块只应观察公开状态字段或消费清单，不应读取或修改 `scheduler_lock`、`minio_delete_task` 等内部表。

以下内容属于内部实现细节：

- JPA 实体字段完整结构。
- Repository 方法名称。
- MinIO bucket 名称。
- MinIO objectName 具体拼接规则。
- 上传临时分片对象路径。
- `storagePath` 的长期格式。
- 数据库表名和索引名。

其他模块不应直接依赖这些细节。

workspace 审计日志查询已经提供，但只属于模块二内部回溯能力，不纳入下列跨模块稳定交付边界。

## 12. 当前可交付边界

当前模块二可对外承诺：

```text
模型版本 ID
数据集版本 ID
代码资产 ID、代码工作区 ID、不可变代码版本 ID
READY 数据集消费清单
不含存储路径的代码 consumer manifest
发布时固化的 trainingProfile 与制品 SHA-256/长度证据
与当前 SHA 和策略版本绑定的代码校验/管理员审批证据
跨 READY DatasetVersion 的 externalId 查询
FAILED ImportJob FULL retry
PARTIAL ImportJob INCREMENTAL retry
V2 importJobId 查询和重试句柄
有界异步 MinIO 删除清理
训练实验 ID
训练实验版本 ID
owner_user_id 资源隔离
模型/训练任务类型 CV/NLP/POINT_CLOUD/ROBOT
数据集任务类型 CV/NLP/POINT_CLOUD/ROBOT/MULTIMODAL
pending/running/success/failed/stopped 训练状态语义
Authorization: Bearer <token> 鉴权方式
Legacy ApiResponse 与 V2 代码 V2ErrorResponse/真实 HTTP 状态
不向新消费者暴露 MinIO 路径、凭据或持久下载地址
```

这就是模块二 v1 的稳定对外边界。
