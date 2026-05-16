# 模块二 API 接口文档

本文档描述模块二当前后端实际提供的 API，范围包括模型资产、模型版本、数据集资产、数据集版本、上传、训练实验、训练任务和通用文件对象接口。模块一登录、注册、用户管理接口不在本文档范围内；模块二只依赖模块一提供的登录态。

## 1. 通用约定

### 1.1 基础信息

| 项目 | 说明 |
| --- | --- |
| 默认服务地址 | `http://localhost:8080` |
| 请求编码 | UTF-8 |
| JSON 请求头 | `Content-Type: application/json` |
| 文件上传请求头 | `Content-Type: multipart/form-data` |
| 鉴权头 | `Authorization: Bearer <token>` |

除 `/api/files/health` 外，模块二接口都需要登录态。普通用户只能访问自己的资源；`roleId` 为 `1` 或 `2` 的管理员可访问全部资源。

### 1.2 统一响应格式

大多数接口返回 `ApiResponse<T>`：

```json
{
  "success": true,
  "data": {},
  "errorMessage": null
}
```

失败时 HTTP 状态通常仍为 `200`，业务成功与否以 `success` 字段为准：

```json
{
  "success": false,
  "data": null,
  "errorMessage": "not found or no permission"
}
```

例外：

- `GET /api/files/download` 成功时直接返回文件流；失败时返回 JSON。
- 未登录或无模块一权限时，请求会先被拦截器拦截，响应体是模块一 `Result` 格式，例如 `{"code":400,"message":"请先登录: ...","data":null}`，不会进入模块二 Controller。

### 1.3 枚举

任务类型 `type`：

| 值 | 说明 |
| --- | --- |
| `CV` | 计算机视觉 |
| `NLP` | 自然语言处理 |

CV 子任务 `cvTaskType`：

| 值 |
| --- |
| `IMAGE_CLASSIFICATION` |
| `OBJECT_DETECTION` |
| `SEMANTIC_SEGMENTATION` |
| `INSTANCE_SEGMENTATION` |
| `UNLABELED` |
| `OTHER` |

CV 标注格式 `annotationFormat`：

| 值 |
| --- |
| `NONE` |
| `FOLDER_CLASSIFICATION` |
| `CSV` |
| `YOLO` |
| `COCO` |
| `VOC` |
| `MASK` |
| `LABELME` |
| `OTHER` |

训练状态 `status`：

| 值 | 说明 |
| --- | --- |
| `pending` | 已创建，等待训练 |
| `queued` | 已排队 |
| `running` | 训练中 |
| `success` | 训练成功 |
| `failed` | 训练失败 |
| `stopped` | 已停止 |

### 1.4 常用 ID

| 字段 | 说明 |
| --- | --- |
| `modelAssetId` / `assetId` | 模型资产 ID |
| `modelVersionId` / `id` | 模型版本 ID |
| `datasetAssetId` / `assetId` | 数据集资产 ID |
| `datasetVersionId` / `id` | 数据集版本 ID |
| `experimentId` | 训练实验 ID |
| `trainingVersionId` / `id` | 训练实验版本 ID |
| `uploadId` | 上传会话 ID |

业务集成时优先引用稳定 ID，不建议长期依赖 `storagePath` 或 MinIO 对象路径。

## 2. 模型上传接口

基础路径：`/api/model/upload`

模型上传采用分片流程：初始化上传、上传分片、查询进度、完成合并。分片大小由后端返回，当前为 `5MB`。`partIndex` 从 `0` 开始。

### 2.1 初始化模型上传

```http
POST /api/model/upload/init
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fileName` | string | 是 | 模型文件名，仅支持 `.zip` |
| `fileSize` | number | 是 | 文件字节数，必须大于 `0` |
| `fileFingerprint` | string | 否 | 文件指纹；同用户同文件未完成上传可复用上传会话 |

请求示例：

```json
{
  "fileName": "resnet50.zip",
  "fileSize": 10485760,
  "fileFingerprint": "sha256-demo"
}
```

响应 `data` 示例：

```json
{
  "uploadId": "model-upload-1710000000000-abc",
  "status": "UPLOADING",
  "fileName": "resnet50.zip",
  "fileSize": 10485760,
  "chunkSize": 5242880,
  "totalChunks": 2,
  "uploadedChunks": 0,
  "uploadedBytes": 0,
  "uploadedPartIndexes": [],
  "storagePath": null,
  "assetId": null,
  "versionId": null,
  "createdAt": "2026-05-16T10:00:00Z",
  "updatedAt": "2026-05-16T10:00:00Z"
}
```

### 2.2 上传模型分片

```http
POST /api/model/upload/chunk
Content-Type: multipart/form-data
```

表单参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | string | 是 | 上传会话 ID |
| `partIndex` | integer | 是 | 分片序号，从 `0` 开始 |
| `file` | file | 是 | 当前分片文件 |

规则：

- 非最后一个分片大小必须等于后端返回的 `chunkSize`。
- 最后一个分片可以小于 `chunkSize`。
- 同一 `uploadId` 只能由上传会话所有者访问。

### 2.3 查询模型上传进度

```http
GET /api/model/upload/progress?uploadId={uploadId}
```

响应 `data` 与初始化接口相同。`status` 可能为 `UPLOADING`、`COMPLETING`、`COMPLETED`。

### 2.4 完成模型上传

```http
POST /api/model/upload/complete
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | string | 是 | 上传会话 ID |
| `modelName` | string | 是 | 模型名称 |
| `version` | string | 是 | 模型版本号 |
| `type` | string | 是 | `CV` 或 `NLP` |
| `remark` | string | 是 | 备注 |

请求示例：

```json
{
  "uploadId": "model-upload-1710000000000-abc",
  "modelName": "ResNet50",
  "version": "v1",
  "type": "CV",
  "remark": "baseline model"
}
```

响应 `data` 示例：

```json
{
  "uploadId": "model-upload-1710000000000-abc",
  "id": "model-ver-9f1a",
  "assetId": "model-asset-8e2b",
  "name": "ResNet50",
  "version": "v1",
  "type": "CV",
  "remark": "baseline model",
  "fileName": "resnet50.zip",
  "storagePath": "users/3/models/model-asset-8e2b/v1/resnet50.zip",
  "sizeBytes": 10485760,
  "status": "COMPLETED",
  "ownerUserId": 3,
  "createdAt": "2026-05-16T10:00:00Z",
  "updatedAt": "2026-05-16T10:00:10Z"
}
```

说明：

- 返回的 `id` 是模型版本 ID，可作为 `modelVersionId` 使用。
- 返回的 `assetId` 是模型资产 ID。
- 模型最终对象路径按 `users/{userId}/models/{assetId}/{version}/{fileName}` 生成，同名模型、同版本、同文件名重复上传也不会互相覆盖。
- 模型 zip 必须为合法非空压缩包；zip 内路径不能包含绝对路径、盘符、`..` 或空字节。

## 3. 模型查询接口

基础路径：`/api/model`

### 3.1 查询模型列表

```http
GET /api/model/list
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 否 | `CV` 或 `NLP` |
| `keyword` | string | 否 | 按模型名称、版本、备注、文件名模糊搜索 |
| `page` | integer | 否 | 页码，从 `1` 开始 |
| `current` | integer | 否 | 页码；优先级高于 `page` |
| `pageSize` | integer | 否 | 每页数量；不传则返回全部 |

响应 `data`：

| 字段 | 说明 |
| --- | --- |
| `data` | 模型版本列表 |
| `total` | 过滤后的总数 |
| `page` | 当前页 |
| `pageSize` | 每页数量 |

列表项字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 模型版本 ID |
| `assetId` | 模型资产 ID |
| `name` | 模型名称 |
| `version` | 模型版本 |
| `type` | 任务类型 |
| `remark` | 模型资产备注 |
| `ownerUserId` | 归属用户 ID |
| `storagePath` | 存储路径 |
| `fileName` | 文件名 |
| `sizeBytes` | 文件大小 |
| `createdAt` | 创建时间 |

### 3.2 查询模型详情

```http
GET /api/model/detail?id={modelVersionId}
```

返回指定模型版本详情。普通用户只能查询自己的模型版本。

### 3.3 查询模型代码文件

```http
GET /api/model/code-files?id={modelVersionId}
```

响应 `data` 为数组：

| 字段 | 说明 |
| --- | --- |
| `path` | zip 内路径 |
| `fileName` | 文件名 |
| `extension` | 后缀 |
| `sizeBytes` | 文件大小 |

### 3.4 预览模型代码

```http
GET /api/model/previewCode?id={modelVersionId}&path={path}
```

响应 `data`：

| 字段 | 说明 |
| --- | --- |
| `path` | zip 内路径 |
| `fileName` | 文件名 |
| `content` | 文本内容 |
| `sizeBytes` | 文件大小 |

### 3.5 删除模型版本

```http
DELETE /api/model/delete?id={modelVersionId}
```

响应 `data`：

| 字段 | 说明 |
| --- | --- |
| `id` | 模型版本 ID |
| `assetId` | 模型资产 ID |
| `deleted` | 是否已软删除 |
| `minioDeleteQueued` | 是否已加入 MinIO 删除任务 |

如果模型版本被训练实验引用，删除会失败。

## 4. 模型资产 CRUD 接口

基础路径：`/api/model-assets`

### 4.1 创建模型资产

```http
POST /api/model-assets
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 模型资产名称 |
| `type` | string | 是 | `CV` 或 `NLP` |
| `remark` | string | 否 | 备注 |

注意：即使客户端传入 `id`、`ownerUserId`、`deleted` 等字段，后端创建时也会重新生成 `id`，并使用当前登录用户作为 `ownerUserId`。

### 4.2 查询模型资产详情

```http
GET /api/model-assets/{id}
```

### 4.3 查询模型资产列表

```http
GET /api/model-assets
```

普通用户返回自己的未删除资产；管理员返回全部未删除资产。

### 4.4 更新模型资产

```http
PUT /api/model-assets/{id}
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 新名称 |
| `type` | string | 是 | `CV` 或 `NLP` |
| `remark` | string | 否 | 备注 |

只更新 `name`、`type`、`remark` 和 `updatedAt`。

### 4.5 删除模型资产

```http
DELETE /api/model-assets/{id}
```

删除模型资产会软删除该资产及其下未删除的模型版本，并将相关 MinIO 对象加入删除任务。如果任一模型版本被训练实验引用，删除会失败。

## 5. 模型版本 CRUD 接口

基础路径：`/api/model-versions`

### 5.1 创建模型版本

```http
POST /api/model-versions
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assetId` | string | 是 | 模型资产 ID |
| `version` | string | 是 | 版本号；同一资产下唯一 |

普通用户不能通过该接口写入 `storagePath`、`fileName`、`sizeBytes`，这些存储元数据只能由上传服务生成。管理员可写入存储元数据。

注意：创建时后端会忽略客户端传入的 `id`，重新生成 `model-ver-...`。

### 5.2 查询模型版本详情

```http
GET /api/model-versions/{id}
```

### 5.3 查询模型版本列表

```http
GET /api/model-versions?assetId={assetId}
```

`assetId` 可选。不传时普通用户返回自己可见模型资产下的全部未删除版本，管理员返回全部未删除版本。

### 5.4 更新模型版本

```http
PUT /api/model-versions/{id}
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assetId` | string | 否 | 目标资产 ID；普通用户不能修改 |
| `version` | string | 是 | 版本号；同一资产下唯一 |
| `fileName` | string | 否 | 管理员可更新 |
| `storagePath` | string | 否 | 管理员可更新 |
| `sizeBytes` | number | 否 | 管理员可更新 |

普通用户不能修改存储元数据。

### 5.5 删除模型版本

```http
DELETE /api/model-versions/{id}
```

如果模型版本被训练实验引用，删除会失败。删除成功后会软删除版本，并将对象加入 MinIO 删除任务。

## 6. 数据集上传接口

基础路径：`/api/dataset/upload`

数据集分片上传流程与模型上传一致。分片大小由后端返回，当前为 `5MB`。

### 6.1 初始化数据集上传

```http
POST /api/dataset/upload/init
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fileName` | string | 是 | 数据集文件名 |
| `fileSize` | number | 是 | 文件字节数，必须大于 `0` |
| `fileFingerprint` | string | 否 | 文件指纹 |
| `datasetName` | string | 是 | 数据集名称 |
| `version` | string | 否 | 版本号；不传默认为 `v1` |
| `type` | string | 是 | `CV` 或 `NLP` |
| `cvTaskType` | string | 否 | CV 子任务；NLP 会被置为 `null` |
| `annotationFormat` | string | 否 | CV 标注格式；NLP 会被置为 `null` |
| `remark` | string | 否 | 备注 |

文件类型规则：

| 类型 | 规则 |
| --- | --- |
| `CV` | 分片上传只支持 `.zip`；zip 内必须至少包含图片文件 |
| `NLP` | 支持 `.txt`、`.json`、`.jsonl`、`.csv`、`.xlsx`、`.xls`、`.pdf`、`.docx`、`.xml`，或只包含这些文件的 `.zip` |

响应 `data` 字段与模型上传进度类似，额外包含 `cvTaskType`、`annotationFormat`。

### 6.2 上传数据集分片

```http
POST /api/dataset/upload/chunk
Content-Type: multipart/form-data
```

表单参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | string | 是 | 上传会话 ID |
| `partIndex` | integer | 是 | 分片序号，从 `0` 开始 |
| `file` | file | 是 | 当前分片文件 |

### 6.3 查询数据集上传进度

```http
GET /api/dataset/upload/progress?uploadId={uploadId}
```

### 6.4 完成数据集上传

```http
POST /api/dataset/upload/complete
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | string | 是 | 上传会话 ID |

响应 `data` 示例：

```json
{
  "uploadId": "dataset-upload-1710000000000-abc",
  "id": "dataset-ver-9f1a",
  "assetId": "dataset-asset-8e2b",
  "name": "casting defect",
  "version": "v1",
  "type": "CV",
  "cvTaskType": "IMAGE_CLASSIFICATION",
  "annotationFormat": "FOLDER_CLASSIFICATION",
  "remark": "sample dataset",
  "fileName": "casting.zip",
  "storagePath": "users/3/datasets/dataset-asset-8e2b/v1/casting.zip",
  "sizeBytes": 10485760,
  "status": "COMPLETED",
  "ownerUserId": 3,
  "createdAt": "2026-05-16T10:00:00Z",
  "updatedAt": "2026-05-16T10:00:10Z"
}
```

返回的 `id` 是数据集版本 ID，可作为 `datasetVersionId` 使用。

### 6.5 上传 CV 文件夹

```http
POST /api/dataset/upload/folder
Content-Type: multipart/form-data
```

表单参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `datasetName` | string | 是 | 数据集名称 |
| `version` | string | 否 | 版本号；不传默认为 `v1` |
| `type` | string | 是 | 必须为 `CV` |
| `cvTaskType` | string | 否 | CV 子任务 |
| `annotationFormat` | string | 否 | CV 标注格式 |
| `remark` | string | 否 | 备注 |
| `files` | file[] | 是 | 文件列表 |
| `paths` | string[] | 是 | 每个文件对应的相对路径，数量必须与 `files` 一致 |

后端会将文件夹打包为 zip 并生成数据集资产和版本。路径不能是绝对路径、盘符路径，也不能包含 `..` 或空字节。

## 7. 数据集查询接口

基础路径：`/api/dataset`

### 7.1 查询数据集列表

```http
GET /api/dataset/list
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 否 | `CV` 或 `NLP` |
| `keyword` | string | 否 | 按数据集名称、版本、备注、文件名模糊搜索 |
| `page` | integer | 否 | 页码 |
| `current` | integer | 否 | 页码；优先级高于 `page` |
| `pageSize` | integer | 否 | 每页数量；不传则返回全部 |

列表项字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 数据集资产 ID |
| `assetId` | 数据集资产 ID |
| `name` | 数据集名称 |
| `type` | `CV` 或 `NLP` |
| `cvTaskType` | CV 子任务 |
| `annotationFormat` | 标注格式 |
| `remark` | 数据集备注 |
| `ownerUserId` | 归属用户 ID |
| `versionId` | 最新数据集版本 ID |
| `version` | 最新版本号 |
| `fileName` | 最新版本文件名 |
| `storagePath` | 最新版本存储路径 |
| `sizeBytes` | 文件大小 |
| `size` | 格式化后的文件大小 |
| `versionRemark` | 版本备注 |
| `fileCount` | 当前资产下未删除版本数量 |
| `uploadTime` | 最新版本上传时间 |
| `createdAt` | 资产创建时间 |
| `updatedAt` | 资产更新时间 |

训练创建时应使用 `versionId` 作为 `datasetVersionId`。

## 8. 数据集资产 CRUD 接口

基础路径：`/api/dataset-assets`

### 8.1 创建数据集资产

```http
POST /api/dataset-assets
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 数据集名称 |
| `type` | string | 是 | `CV` 或 `NLP` |
| `cvTaskType` | string | 否 | CV 子任务 |
| `annotationFormat` | string | 否 | CV 标注格式 |
| `remark` | string | 否 | 备注 |

注意：创建时后端会忽略客户端传入的 `id`，重新生成 `dataset-asset-...`，并使用当前登录用户作为 `ownerUserId`。

### 8.2 查询数据集资产详情

```http
GET /api/dataset-assets/{id}
```

### 8.3 查询数据集资产列表

```http
GET /api/dataset-assets
```

普通用户返回自己的未删除资产；管理员返回全部未删除资产。

### 8.4 更新数据集资产

```http
PUT /api/dataset-assets/{id}
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 新名称 |
| `type` | string | 是 | `CV` 或 `NLP` |
| `cvTaskType` | string | 否 | CV 子任务 |
| `annotationFormat` | string | 否 | CV 标注格式 |
| `remark` | string | 否 | 备注 |

### 8.5 删除数据集资产

```http
DELETE /api/dataset-assets/{id}
```

删除数据集资产会软删除该资产及其下未删除的数据集版本，并将相关 MinIO 对象加入删除任务。如果任一数据集版本被训练实验引用，删除会失败。

## 9. 数据集版本 CRUD 接口

基础路径：`/api/dataset-versions`

### 9.1 创建数据集版本

```http
POST /api/dataset-versions
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assetId` | string | 是 | 数据集资产 ID |
| `version` | string | 是 | 版本号；同一资产下唯一 |
| `remark` | string | 否 | 备注 |

普通用户不能通过该接口写入 `storagePath`、`fileName`、`sizeBytes`，这些存储元数据只能由上传服务生成。管理员可写入存储元数据。

注意：创建时后端会忽略客户端传入的 `id`，重新生成 `dataset-ver-...`。

### 9.2 查询数据集版本详情

```http
GET /api/dataset-versions/{id}
```

### 9.3 查询数据集版本列表

```http
GET /api/dataset-versions?assetId={assetId}
```

`assetId` 可选。不传时普通用户返回自己可见数据集资产下的全部未删除版本，管理员返回全部未删除版本。

### 9.4 更新数据集版本

```http
PUT /api/dataset-versions/{id}
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assetId` | string | 否 | 目标资产 ID；普通用户不能修改 |
| `version` | string | 是 | 版本号；同一资产下唯一 |
| `remark` | string | 否 | 备注 |
| `fileName` | string | 否 | 管理员可更新 |
| `storagePath` | string | 否 | 管理员可更新 |
| `sizeBytes` | number | 否 | 管理员可更新 |

### 9.5 删除数据集版本

```http
DELETE /api/dataset-versions/{id}
```

如果数据集版本被训练实验引用，删除会失败。删除成功后会软删除版本，并将对象加入 MinIO 删除任务。

## 10. 训练任务接口

基础路径：`/api/task`

`/api/task` 是当前前端兼容路径，操作训练实验的最新版本。

### 10.1 创建训练任务

```http
POST /api/task/create
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 否 | 任务名称；不传时使用实验 ID |
| `modelVersionId` | string | 是 | 模型版本 ID |
| `datasetVersionId` | string | 是 | 数据集版本 ID |
| `codeVersionId` | string | 是 | 代码版本 ID |
| `hyperParams` | object/string | 是 | 超参数 JSON；也可使用 `params` |
| `params` | object/string | 否 | `hyperParams` 的兼容字段 |
| `remark` | string | 否 | 备注 |

后端会校验模型版本、数据集版本是否存在且当前用户可访问，并校验模型类型与数据集类型一致。

响应 `data`：

| 字段 | 说明 |
| --- | --- |
| `id` | 训练实验版本 ID |
| `experimentId` | 训练实验 ID |
| `versionNo` | 实验版本号 |
| `name` | 名称 |
| `modelVersionId` | 模型版本 ID |
| `codeVersionId` | 代码版本 ID |
| `datasetVersionId` | 数据集版本 ID |
| `hyperParams` | 超参数 JSON |
| `status` | 状态，初始为 `pending` |
| `progress` | 进度，初始为 `0` |
| `metrics` | 指标 JSON |
| `logPath` | 日志路径 |
| `outputPath` | 输出路径 |
| `errorMessage` | 错误信息 |
| `startedAt` | 开始时间 |
| `finishedAt` | 结束时间 |
| `remark` | 备注 |
| `ownerUserId` | 归属用户 ID |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |
| `createTime` | `createdAt` 的字符串兼容字段 |

### 10.2 查询训练任务列表

```http
GET /api/task/list
```

返回当前用户可见实验的最新版本：

```json
{
  "success": true,
  "data": {
    "data": [],
    "total": 0
  },
  "errorMessage": null
}
```

### 10.3 查询训练任务详情

```http
GET /api/task/detail?id={id}
```

`id` 可以是训练实验版本 ID，也可以是训练实验 ID。传实验 ID 时返回该实验最新版本。

### 10.4 停止训练任务

```http
POST /api/task/stop?id={id}
```

`id` 可以是训练实验版本 ID，也可以是训练实验 ID。停止后状态为 `stopped`，进度为 `0`。

### 10.5 回写训练结果

```http
POST /api/task/result?id={id}
```

`id` 可以是训练实验版本 ID，也可以是训练实验 ID。传实验 ID 时更新最新版本。

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `status` | string | 否 | `pending`、`queued`、`running`、`success`、`failed`、`stopped` |
| `progress` | integer | 否 | `0` 到 `100` |
| `metrics` | object/string | 否 | 训练指标 JSON |
| `logPath` | string | 否 | 日志路径 |
| `outputPath` | string | 否 | 输出路径 |
| `errorMessage` | string | 否 | 错误信息 |
| `startedAt` | string | 否 | ISO-8601 时间 |
| `finishedAt` | string | 否 | ISO-8601 时间 |
| `remark` | string | 否 | 备注 |

### 10.6 删除训练实验

```http
DELETE /api/task/delete?id={id}
```

`id` 可以是训练实验版本 ID，也可以是训练实验 ID。删除会删除同一 `experimentId` 下全部实验版本。

## 11. 训练实验版本接口

基础路径：`/api/experiments`

`/api/experiments` 提供更明确的实验版本管理接口。

### 11.1 创建实验

```http
POST /api/experiments
```

请求体与 `/api/task/create` 相同。

### 11.2 查询实验版本历史

```http
GET /api/experiments/{experimentId}/versions
```

返回该实验下当前用户可见的全部版本，按 `versionNo` 升序排列。

### 11.3 查询指定实验版本

```http
GET /api/experiments/{experimentId}/versions/{versionNo}
```

### 11.4 创建实验新版本

```http
POST /api/experiments/{experimentId}/versions
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 否 | 新版本名称；不传继承上一版本 |
| `modelVersionId` | string | 否 | 模型版本 ID；不传继承上一版本 |
| `datasetVersionId` | string | 否 | 数据集版本 ID；不传继承上一版本 |
| `codeVersionId` | string | 否 | 代码版本 ID；不传继承上一版本 |
| `hyperParams` | object/string | 否 | 超参数 JSON；不传继承上一版本 |
| `params` | object/string | 否 | `hyperParams` 的兼容字段 |
| `remark` | string | 否 | 备注；不传继承上一版本 |

创建成功后 `versionNo` 为上一版本加 `1`，状态为 `pending`。

### 11.5 更新实验版本超参数

```http
PUT /api/experiments/{experimentId}/versions/{versionNo}/hyper-parameters
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hyperParams` | object/string | 是 | 超参数 JSON；也可使用 `params` |
| `params` | object/string | 否 | `hyperParams` 的兼容字段 |
| `remark` | string | 否 | 同时更新备注 |

### 11.6 更新实验版本训练结果

```http
PUT /api/experiments/{experimentId}/versions/{versionNo}/result
```

请求体与 `/api/task/result` 相同。

## 12. 通用文件对象接口

基础路径：`/api/files`

通用文件接口主要用于调试或辅助能力。业务流程优先通过模型版本 ID、数据集版本 ID 引用文件。

### 12.1 MinIO 健康检查

```http
GET /api/files/health
```

该接口为公开接口，无需登录。

成功响应：

```json
{
  "success": true,
  "data": {
    "minio": "ok"
  },
  "errorMessage": null
}
```

### 12.2 上传文件对象

```http
POST /api/files/upload
Content-Type: multipart/form-data
```

表单参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | file | 是 | 文件 |
| `objectName` | string | 否 | 对象名；不传使用原始文件名 |

普通用户上传相对路径时，后端会自动补齐为：

```text
users/{当前用户ID}/files/{objectName}
```

如果普通用户传入的 `objectName` 已经以 `users/{当前用户ID}/` 开头，则保持该用户前缀下的路径。管理员可上传到任意合法对象路径。

响应 `data`：

| 字段 | 说明 |
| --- | --- |
| `objectName` | 实际对象名 |
| `size` | 文件大小 |
| `etag` | MinIO ETag |

### 12.3 下载文件对象

```http
GET /api/files/download?objectName={objectName}
```

成功时返回文件流，并设置 `Content-Disposition`。普通用户只能下载 `users/{当前用户ID}/...` 下的对象；管理员可下载全部对象。

### 12.4 删除文件对象

```http
DELETE /api/files/delete?objectName={objectName}
```

删除不会同步阻塞删除 MinIO 对象，而是写入删除任务。

响应 `data`：

| 字段 | 说明 |
| --- | --- |
| `objectName` | 对象名 |
| `minioDeleteQueued` | 是否已加入删除任务 |

## 13. 错误处理与安全规则

常见失败原因：

| 场景 | 典型 `errorMessage` |
| --- | --- |
| 未登录 | `请先登录: ...` |
| 无权访问资源 | `not found or no permission: ...` |
| 任务类型非法 | `任务类型仅支持 CV 或 NLP` |
| 上传会话不存在或越权 | `uploadId invalid or not accessible` |
| 分片缺失 | `分片未上传完成` / `缺少分片: ...` |
| 版本重复 | `model version already exists for asset: ...` / `dataset version already exists for asset: ...` |
| 被训练实验引用 | `model version is referenced by training experiments` / `dataset version is referenced by training experiments` |
| 训练状态非法 | `status only supports pending, queued, running, success, failed, stopped` |
| 进度非法 | `progress must be between 0 and 100` |

安全规则：

- 创建资产和版本时，客户端传入的主键 `id` 不生效，后端会重新生成。
- 普通用户不能创建或修改模型/数据集版本的存储元数据。
- 普通用户只能访问自己 `ownerUserId` 下的资源和 `users/{ownerUserId}/...` 下的文件对象。
- 模型、数据集删除均为软删除；MinIO 对象通过删除任务异步清理。
- 模型版本或数据集版本被训练实验引用时，不允许删除。
- zip 内路径不能包含绝对路径、盘符、`..` 或空字节。
