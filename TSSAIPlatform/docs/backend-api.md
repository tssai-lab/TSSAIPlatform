# 后端 API 文档

本文档按当前 Spring Boot 后端实现整理，供前端对接使用。

## 基础信息

- 后端地址：`http://127.0.0.1:8080`
- 前端开发代理：前端请求 `/api/*` 会代理到后端 8080 端口
- 请求格式：JSON 接口使用 `Content-Type: application/json`
- 文件上传接口使用 `multipart/form-data`
- 时间字段：后端返回 `Instant`，JSON 中通常为 ISO 字符串，如 `2026-04-18T04:30:00Z`
- 当前登录接口为演示登录，不校验 Token；演示账号见「登录」
- 任务类型强制使用枚举：`CV` 或 `NLP`。模型、数据集和训练实验均会在后端校验该类型。

## 通用响应格式

除登录接口和文件下载接口外，后端大多数接口返回：

```json
{
  "success": true,
  "data": {},
  "errorMessage": null
}
```

失败时：

```json
{
  "success": false,
  "data": null,
  "errorMessage": "错误信息"
}
```

前端建议先判断 `success`，失败时展示 `errorMessage`。

## 登录

### 账号登录

`POST /api/login/account`

请求体：

```json
{
  "username": "admin",
  "password": "ant.design",
  "autoLogin": true,
  "type": "account"
}
```

演示账号：

| 用户名 | 密码 | 权限 |
| --- | --- | --- |
| `admin` | `ant.design` | `admin` |
| `user` | `ant.design` | `user` |

成功响应：

```json
{
  "status": "ok",
  "type": "account",
  "currentAuthority": "admin"
}
```

失败响应：

```json
{
  "status": "error",
  "type": "account",
  "currentAuthority": "guest"
}
```

注意：该接口没有使用通用 `ApiResponse` 包装。

### 获取当前用户

`GET /api/currentUser`

响应：

```json
{
  "success": true,
  "data": {
    "name": "当前用户",
    "avatar": null,
    "userid": "demo",
    "access": "admin"
  },
  "errorMessage": null
}
```

### 退出登录

`POST /api/login/outLogin`

响应：

```json
{
  "success": true,
  "data": null,
  "errorMessage": null
}
```

## MinIO 文件对象

适合通用文件上传、下载、删除。模型分片上传请看「模型上传」。

### MinIO 健康检查

`GET /api/files/health`

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

失败时 `success=false`，`errorMessage` 形如 `MinIO 连接失败: ...`。

### 上传文件对象

`POST /api/files/upload`

请求类型：`multipart/form-data`

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | File | 是 | 要上传的文件 |
| `objectName` | string | 否 | MinIO 对象路径；不传时使用原始文件名 |

示例：

```ts
const formData = new FormData();
formData.append('file', file);
formData.append('objectName', 'datasets/demo/train.zip');

await request('/api/files/upload', {
  method: 'POST',
  data: formData,
});
```

成功响应：

```json
{
  "success": true,
  "data": {
    "objectName": "datasets/demo/train.zip",
    "size": 1024,
    "etag": "etag-value"
  },
  "errorMessage": null
}
```

### 下载文件对象

`GET /api/files/download?objectName={objectName}`

Query 参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `objectName` | string | 是 | MinIO 对象路径 |

成功响应：二进制文件流，响应头包含 `Content-Disposition: attachment`。

前端可直接拼接下载地址：

```ts
const url = `/api/files/download?objectName=${encodeURIComponent(objectName)}`;
window.open(url);
```

失败响应：HTTP 404，Body 为通用失败格式。

### 删除文件对象

`DELETE /api/files/delete?objectName={objectName}`

成功响应：

```json
{
  "success": true,
  "data": {
    "objectName": "datasets/demo/train.zip",
    "deleted": true
  },
  "errorMessage": null
}
```

## 模型上传

模型文件使用分片上传，流程为：

1. 调用初始化接口拿到 `uploadId`、`chunkSize` 和 `uploadedPartIndexes`
2. 前端按 `chunkSize` 切片，只上传缺失分片
3. 页面刷新或网络中断后，重新调用初始化接口或进度接口恢复上传
4. 所有分片上传完成后，调用完成接口合并文件并落库
5. 最终文件存入 MinIO，路径为 `models/{modelName}/{version}/{fileName}`

### 初始化分片上传

`POST /api/model/upload/init`

请求体：

```json
{
  "fileName": "resnet50.zip",
  "fileSize": 104857600,
  "fileFingerprint": "resnet50.zip|104857600|1710000000000|resnet50|v1.0.0|CV"
}
```

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fileName` | string | 是 | 文件名 |
| `fileSize` | number | 是 | 文件大小，单位 Byte |
| `fileFingerprint` | string | 否 | 前端生成的文件指纹；同指纹未完成上传会复用原 uploadId |

成功响应：

```json
{
  "success": true,
  "data": {
    "uploadId": "model-upload-1710000000000-xxxxxxxx",
    "status": "UPLOADING",
    "fileName": "resnet50.zip",
    "fileSize": 104857600,
    "chunkSize": 5242880,
    "totalChunks": 20,
    "uploadedChunks": 0,
    "uploadedBytes": 0,
    "uploadedPartIndexes": []
  },
  "errorMessage": null
}
```

说明：当前后端固定 `chunkSize = 5 * 1024 * 1024`，即 5MB。上传会话和分片索引会持久化到数据库，前端刷新后可用同一 `fileFingerprint` 再次调用 init，后端会返回原会话和已上传分片进度。

### 上传单个分片

`POST /api/model/upload/chunk`

请求类型：`multipart/form-data`

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | string | 是 | 初始化接口返回的上传 ID |
| `partIndex` | number | 是 | 分片序号，建议从 `0` 开始递增 |
| `file` | Blob/File | 是 | 当前分片内容 |

示例：

```ts
const formData = new FormData();
formData.append('uploadId', uploadId);
formData.append('partIndex', String(partIndex));
formData.append('file', chunk);

await request('/api/model/upload/chunk', {
  method: 'POST',
  data: formData,
});
```

成功响应：

```json
{
  "success": true,
  "data": {
    "uploadId": "model-upload-1710000000000-xxxxxxxx",
    "status": "UPLOADING",
    "fileName": "resnet50.zip",
    "fileSize": 104857600,
    "chunkSize": 5242880,
    "totalChunks": 20,
    "uploadedChunks": 1,
    "uploadedBytes": 5242880,
    "uploadedPartIndexes": [0]
  },
  "errorMessage": null
}
```

失败场景：

- `uploadId` 不存在：`uploadId 无效`
- `partIndex` 超出范围：`partIndex 超出范围`
- MinIO 写入失败：`分片上传失败: ...`

### 查询模型上传进度

`GET /api/model/upload/progress?uploadId={uploadId}`

响应字段与初始化接口一致。返回字段里的 `uploadedPartIndexes` 是前端续传的关键依据。前端应跳过这些分片，只上传缺失分片。

### 完成模型上传

`POST /api/model/upload/complete`

请求体：

```json
{
  "uploadId": "model-upload-1710000000000-xxxxxxxx",
  "modelName": "resnet50",
  "version": "v1.0.0",
  "type": "CV",
  "remark": "ImageNet 预训练模型"
}
```

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | string | 是 | 初始化接口返回的上传 ID |
| `modelName` | string | 是 | 模型名称 |
| `version` | string | 是 | 模型版本 |
| `type` | string | 是 | 模型任务类型，仅允许 `CV` 或 `NLP` |
| `remark` | string | 是 | 备注，后端会拒绝空备注 |

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "model-ver-xxxxxxxx",
    "name": "resnet50",
    "version": "v1.0.0",
    "type": "CV",
    "remark": "ImageNet 预训练模型",
    "storagePath": "models/resnet50/v1.0.0/resnet50.zip",
    "createdAt": "2026-04-18T04:30:00Z"
  },
  "errorMessage": null
}
```

说明：

- 完成接口会把临时分片合并为最终对象，并删除临时分片。
- 完成接口会新增一条模型资产记录和一条模型版本记录。
- 完成接口会校验分片数量和分片序号，缺少任一分片都会拒绝合并。
- `remark` 为空会返回失败响应：`remark 不能为空`。

## 模型展示接口

这些接口用于模型列表、详情和删除，返回的是模型版本视角的数据。

### 获取模型列表

`GET /api/model/list`

成功响应：

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "model-ver-xxxxxxxx",
        "name": "resnet50",
        "version": "v1.0.0",
        "type": "CV",
        "remark": "ImageNet 预训练模型",
        "storagePath": "models/resnet50/v1.0.0/resnet50.zip",
        "sizeBytes": 104857600,
        "createdAt": "2026-04-18T04:30:00Z"
      }
    ],
    "total": 1
  },
  "errorMessage": null
}
```

### 获取模型详情

`GET /api/model/detail?id={id}`

Query 参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 模型版本 ID |

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "model-ver-xxxxxxxx",
    "assetId": "model-asset-xxxxxxxx",
    "name": "resnet50",
    "version": "v1.0.0",
    "type": "CV",
    "remark": "ImageNet 预训练模型",
    "storagePath": "models/resnet50/v1.0.0/resnet50.zip",
    "sizeBytes": 104857600,
    "createdAt": "2026-04-18T04:30:00Z"
  },
  "errorMessage": null
}
```

不存在时：

```json
{
  "success": false,
  "data": null,
  "errorMessage": "模型不存在"
}
```

### 查询模型包内代码文件

`GET /api/model/code-files?id={id}`

说明：该接口会读取模型版本对应的 zip 包，列出可在线预览的代码或文本文件。

成功响应：

```json
{
  "success": true,
  "data": [
    {
      "path": "train.py",
      "fileName": "train.py",
      "extension": ".py",
      "sizeBytes": 2048
    }
  ],
  "errorMessage": null
}
```

### 预览模型代码文件

`GET /api/model/previewCode?id={id}&path={path}`

说明：`path` 为 `code-files` 返回的模型包内相对路径。当前单文件预览上限为 1MB。

成功响应：

```json
{
  "success": true,
  "data": {
    "path": "train.py",
    "fileName": "train.py",
    "content": "print('train')",
    "sizeBytes": 2048
  },
  "errorMessage": null
}
```

### 删除模型

`DELETE /api/model/delete?id={id}`

说明：删除模型版本记录；如果该版本有 `storagePath`，会尝试删除 MinIO 中对应文件。MinIO 删除失败不会阻断数据库记录删除。

成功响应：

```json
{
  "success": true,
  "data": null,
  "errorMessage": null
}
```

## 模型资产 CRUD

模型资产表表示一个模型主体，不直接代表某个文件版本。

### ModelAsset 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 资产 ID；创建时不传则后端生成 |
| `name` | string | 模型名称 |
| `type` | string | 模型任务类型，仅允许 `CV` 或 `NLP` |
| `remark` | string | 备注 |
| `createdAt` | string | 创建时间 |
| `updatedAt` | string | 更新时间 |

### 创建模型资产

`POST /api/model-assets`

请求体：

```json
{
  "name": "resnet50",
  "type": "CV",
  "remark": "ImageNet 预训练模型"
}
```

响应：`ApiResponse<ModelAsset>`

### 查询模型资产列表

`GET /api/model-assets`

响应：`ApiResponse<ModelAsset[]>`

### 查询模型资产详情

`GET /api/model-assets/{id}`

响应：`ApiResponse<ModelAsset>`

### 更新模型资产

`PUT /api/model-assets/{id}`

请求体：

```json
{
  "name": "resnet50",
  "type": "CV",
  "remark": "更新后的备注"
}
```

响应：`ApiResponse<ModelAsset>`

### 删除模型资产

`DELETE /api/model-assets/{id}`

响应：`ApiResponse<null>`

注意：该接口只删除模型资产记录，不会级联删除模型版本，也不会删除 MinIO 文件。前端如需完整删除，请优先使用 `DELETE /api/model/delete?id={versionId}` 删除版本文件。

## 模型版本 CRUD

模型版本表表示某个模型的一个版本及其文件路径。

### ModelVersion 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 版本 ID；创建时不传则后端生成 |
| `assetId` | string | 所属模型资产 ID |
| `version` | string | 版本号 |
| `fileName` | string | 文件名 |
| `storagePath` | string | MinIO 对象路径 |
| `sizeBytes` | number | 文件大小，单位 Byte |
| `createdAt` | string | 创建时间 |

### 创建模型版本

`POST /api/model-versions`

请求体：

```json
{
  "assetId": "model-asset-xxxxxxxx",
  "version": "v1.0.0",
  "fileName": "resnet50.zip",
  "storagePath": "models/resnet50/v1.0.0/resnet50.zip",
  "sizeBytes": 104857600
}
```

响应：`ApiResponse<ModelVersion>`

### 查询模型版本列表

`GET /api/model-versions`

可选 Query：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assetId` | string | 否 | 按模型资产 ID 过滤 |

响应：`ApiResponse<ModelVersion[]>`

### 查询模型版本详情

`GET /api/model-versions/{id}`

响应：`ApiResponse<ModelVersion>`

### 更新模型版本

`PUT /api/model-versions/{id}`

请求体：

```json
{
  "assetId": "model-asset-xxxxxxxx",
  "version": "v1.0.1",
  "fileName": "resnet50.zip",
  "storagePath": "models/resnet50/v1.0.1/resnet50.zip",
  "sizeBytes": 104857600
}
```

响应：`ApiResponse<ModelVersion>`

### 删除模型版本

`DELETE /api/model-versions/{id}`

响应：`ApiResponse<null>`

注意：该 CRUD 删除接口只删除数据库版本记录，不会删除 MinIO 文件。需要同时删除 MinIO 文件时，使用 `DELETE /api/model/delete?id={versionId}`。

## 数据集列表

### 查询数据集聚合列表

`GET /api/dataset/list`

说明：该接口用于数据集列表页展示，会读取 `dataset_asset` 资产表，并关联 `dataset_version` 版本表，返回每个数据集资产的当前版本关键信息。当前版本按版本记录 `createdAt` 最新的一条计算。

可选 Query：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 否 | 按任务类型筛选，仅支持 `CV` 或 `NLP` |

成功响应：

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "dataset-asset-xxxxxxxx",
        "assetId": "dataset-asset-xxxxxxxx",
        "name": "cifar10",
        "type": "CV",
        "remark": "图像分类数据集",
        "versionId": "dataset-ver-xxxxxxxx",
        "version": "v1",
        "fileName": "cifar10.zip",
        "storagePath": "datasets/dataset-asset-xxxxxxxx/v1/cifar10.zip",
        "size": "10.00 GB",
        "sizeBytes": 10737418240,
        "versionRemark": "图像分类数据集",
        "fileCount": 1,
        "uploadTime": "2026-04-19T04:30:00Z",
        "createdAt": "2026-04-19T04:29:00Z",
        "updatedAt": "2026-04-19T04:29:00Z"
      }
    ],
    "total": 1
  },
  "errorMessage": null
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `version` | 当前版本号，取该资产最新版本记录 |
| `versionId` | 当前版本记录 ID，可用于训练创建页选择 |
| `size` / `sizeBytes` | 当前版本文件大小 |
| `versionRemark` | 当前版本说明 |
| `fileCount` | 当前资产下版本记录数量 |
| `uploadTime` | 当前版本上传时间；没有版本时回退为资产创建时间 |

### 数据集详情与版本下载

详情页建议按以下顺序对接：

1. 调用 `GET /api/dataset-assets/{id}` 获取数据集资产名称、类型、备注等基础信息。
2. 调用 `GET /api/dataset-versions?assetId={id}` 获取该数据集的版本历史。
3. 前端按版本记录 `createdAt` 倒序展示版本历史，最新一条作为当前版本。
4. 当前版本或指定版本下载时，使用版本记录里的 `storagePath` 拼接通用下载接口：`/api/files/download?objectName={storagePath}`。

## 数据集资产 CRUD

### DatasetAsset 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 资产 ID；创建时不传则后端生成 |
| `name` | string | 数据集名称 |
| `type` | string | 数据集任务类型，仅允许 `CV` 或 `NLP` |
| `remark` | string | 备注 |
| `createdAt` | string | 创建时间 |
| `updatedAt` | string | 更新时间 |

### 创建数据集资产

`POST /api/dataset-assets`

请求体：

```json
{
  "name": "cifar10",
  "type": "CV",
  "remark": "图像分类数据集"
}
```

响应：`ApiResponse<DatasetAsset>`

### 查询数据集资产列表

`GET /api/dataset-assets`

响应：`ApiResponse<DatasetAsset[]>`

### 查询数据集资产详情

`GET /api/dataset-assets/{id}`

响应：`ApiResponse<DatasetAsset>`

### 更新数据集资产

`PUT /api/dataset-assets/{id}`

请求体：

```json
{
  "name": "cifar10",
  "type": "CV",
  "remark": "更新后的备注"
}
```

响应：`ApiResponse<DatasetAsset>`

### 删除数据集资产

`DELETE /api/dataset-assets/{id}`

说明：该接口用于数据集删除闭环。后端会先查询该资产下所有 `dataset_version` 记录，并删除每个版本对应的 MinIO 对象；MinIO 删除成功后，再删除版本记录和资产记录。若 MinIO 删除失败，接口返回 `success=false`，数据库记录不会被删除。

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "dataset-asset-xxxxxxxx",
    "deletedVersions": 2,
    "deletedObjects": 2
  },
  "errorMessage": null
}
```

失败响应示例：

```json
{
  "success": false,
  "data": null,
  "errorMessage": "删除数据集文件失败: ..."
}
```

## 数据集版本 CRUD

### DatasetVersion 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 版本 ID；创建时不传则后端生成 |
| `assetId` | string | 所属数据集资产 ID |
| `version` | string | 版本号 |
| `fileName` | string | 文件名 |
| `storagePath` | string | MinIO 对象路径 |
| `sizeBytes` | number | 文件大小，单位 Byte |
| `remark` | string | 版本说明 |
| `createdAt` | string | 创建时间 |

### 创建数据集版本

`POST /api/dataset-versions`

请求体：

```json
{
  "assetId": "dataset-asset-xxxxxxxx",
  "version": "v1.0.0",
  "fileName": "cifar10.zip",
  "storagePath": "datasets/cifar10/v1.0.0/cifar10.zip",
  "sizeBytes": 104857600,
  "remark": "图像分类数据集"
}
```

响应：`ApiResponse<DatasetVersion>`

### 查询数据集版本列表

`GET /api/dataset-versions`

可选 Query：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assetId` | string | 否 | 按数据集资产 ID 过滤 |

响应：`ApiResponse<DatasetVersion[]>`

### 查询数据集版本详情

`GET /api/dataset-versions/{id}`

响应：`ApiResponse<DatasetVersion>`

### 更新数据集版本

`PUT /api/dataset-versions/{id}`

请求体：

```json
{
  "assetId": "dataset-asset-xxxxxxxx",
  "version": "v1.0.1",
  "fileName": "cifar10.zip",
  "storagePath": "datasets/cifar10/v1.0.1/cifar10.zip",
  "sizeBytes": 104857600,
  "remark": "补充清洗后的训练样本"
}
```

响应：`ApiResponse<DatasetVersion>`

### 删除数据集版本

`DELETE /api/dataset-versions/{id}`

说明：删除单个版本时会同步删除该版本 `storagePath` 对应的 MinIO 对象。若对象删除失败，版本记录不会被删除。

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "dataset-ver-xxxxxxxx",
    "assetId": "dataset-asset-xxxxxxxx",
    "deletedObject": true
  },
  "errorMessage": null
}
```

## 数据集断点续传

数据集上传使用分片接口，不再通过 `/api/files/upload` 单个 zip 直传。

流程：

1. 调用 `POST /api/dataset/upload/init` 创建或恢复上传会话
2. 调用 `GET /api/dataset/upload/progress` 获取已上传分片
3. 前端按 `chunkSize` 切片，只上传缺失分片
4. 单个分片失败后可重传同一 `partIndex`
5. 所有分片上传完成后调用 `POST /api/dataset/upload/complete`
6. 后端合并 MinIO 临时分片，创建数据集资产和版本记录，并清理临时分片

### 初始化数据集分片上传

`POST /api/dataset/upload/init`

请求体：

```json
{
  "fileName": "cifar10.zip",
  "fileSize": 104857600,
  "fileFingerprint": "cifar10.zip|104857600|1710000000000|cifar10|v1|CV",
  "datasetName": "cifar10",
  "version": "v1",
  "type": "CV",
  "remark": "图像分类数据集"
}
```

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fileName` | string | 是 | 文件名 |
| `fileSize` | number | 是 | 文件大小，单位 Byte |
| `fileFingerprint` | string | 否 | 前端生成的文件指纹；同指纹未完成上传会复用原 uploadId |
| `datasetName` | string | 是 | 数据集名称 |
| `version` | string | 否 | 数据集版本号，默认 `v1` |
| `type` | string | 是 | 数据集任务类型，仅允许 `CV` 或 `NLP` |
| `remark` | string | 否 | 备注 |

格式规则：

- `CV` 数据集支持 zip 压缩包，压缩包内必须包含图片文件：`.jpg`、`.jpeg`、`.png`、`.bmp`、`.gif`、`.webp`、`.tif`、`.tiff`；也支持通过 `/api/dataset/upload/folder` 直接上传图片文件夹。
- `NLP` 数据集支持 `.txt`、`.json`、`.jsonl`，也支持包含这些文件的 zip 压缩包。
- 后端会在初始化时校验文件名扩展名，并在 zip 合并完成后校验压缩包内容；图片文件夹上传会校验目录内文件扩展名并在后端打包为 zip 后入库。

成功响应：

```json
{
  "success": true,
  "data": {
    "uploadId": "dataset-upload-1710000000000-xxxxxxxx",
    "status": "UPLOADING",
    "fileName": "cifar10.zip",
    "fileSize": 104857600,
    "chunkSize": 5242880,
    "totalChunks": 20,
    "uploadedChunks": 0,
    "uploadedBytes": 0,
    "uploadedPartIndexes": []
  },
  "errorMessage": null
}
```

说明：当前后端固定 `chunkSize = 5 * 1024 * 1024`，即 5MB。前端刷新后可用同一 `fileFingerprint` 再次调用 init，后端会返回原会话和已上传分片进度。

### 上传数据集分片

`POST /api/dataset/upload/chunk`

请求类型：`multipart/form-data`

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `uploadId` | string | 是 | 初始化接口返回的上传 ID |
| `partIndex` | number | 是 | 分片序号，从 `0` 开始 |
| `file` | Blob/File | 是 | 当前分片内容 |

成功响应：`ApiResponse<DatasetUploadProgress>`

说明：

- 该接口可重复上传同一个 `partIndex`，后端会覆盖对应分片记录。
- 非末尾分片大小必须等于 `chunkSize`，避免 MinIO 合并失败。

### 查询数据集上传进度

`GET /api/dataset/upload/progress?uploadId={uploadId}`

成功响应：`ApiResponse<DatasetUploadProgress>`

返回字段里的 `uploadedPartIndexes` 是前端续传的关键依据。前端应跳过这些分片，只上传缺失分片。

### 完成数据集上传

`POST /api/dataset/upload/complete`

请求体：

```json
{
  "uploadId": "dataset-upload-1710000000000-xxxxxxxx"
}
```

成功响应：

```json
{
  "success": true,
  "data": {
    "uploadId": "dataset-upload-1710000000000-xxxxxxxx",
    "id": "dataset-ver-xxxxxxxx",
    "assetId": "dataset-asset-xxxxxxxx",
    "name": "cifar10",
    "version": "v1",
    "type": "CV",
    "remark": "图像分类数据集",
    "fileName": "cifar10.zip",
    "storagePath": "datasets/dataset-asset-xxxxxxxx/v1/cifar10.zip",
    "sizeBytes": 104857600,
    "status": "COMPLETED"
  },
  "errorMessage": null
}
```

说明：

- complete 会校验所有分片是否齐全。
- complete 会创建 `DatasetAsset` 和 `DatasetVersion` 记录。
- complete 会删除 MinIO 中 `datasets/_uploads/{uploadId}/...` 下的临时分片，并删除数据库分片记录。
- 完成后的数据集版本可通过 `GET /api/dataset-versions?assetId=...` 查询，并可在训练创建页选择使用。

### 上传 CV 图片文件夹

`POST /api/dataset/upload/folder`

说明：用于 CV 数据集直接选择图片目录上传。前端使用浏览器目录选择能力提交多文件，后端校验目录内文件类型后打包为 zip，上传到 MinIO，并创建 `DatasetAsset` 与 `DatasetVersion` 记录。zip 大文件仍建议使用上面的分片断点续传接口。

请求类型：`multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `datasetName` | string | 是 | 数据集名称 |
| `version` | string | 否 | 数据集版本号，默认 `v1` |
| `type` | string | 是 | 必须为 `CV` |
| `remark` | string | 否 | 备注 |
| `files` | file[] | 是 | 图片目录中的文件列表 |
| `paths` | string[] | 是 | 与 `files` 一一对应的相对路径，例如 `cats/001.jpg` |

校验规则：

- `type` 不是 `CV` 时直接拒绝。
- `files` 与 `paths` 数量必须一致。
- 相对路径不能包含绝对路径、盘符或 `..`。
- 目录内文件仅允许 `.jpg`、`.jpeg`、`.png`、`.bmp`、`.gif`、`.webp`、`.tif`、`.tiff`。

成功响应：`ApiResponse<DatasetUploadCompleteResult>`，字段与 `/api/dataset/upload/complete` 一致，其中 `status` 为 `COMPLETED`。

## 训练实验与版本管理

该模块用于建立模型训练版本管理机制：

- 每次发起训练自动生成唯一 `experimentId`
- 每个实验下按 `versionNo` 保存历史版本记录
- 每条版本记录保存 `codeVersionId`、`datasetVersionId` 与 `hyperParams` 的对应关系
- 支持按 `experimentId` 查看历史版本
- 支持修改指定 `versionNo` 的超参数配置

### TrainingExperimentVersion 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 实验版本记录 ID |
| `experimentId` | string | 实验 ID；一次训练唯一 |
| `versionNo` | number | 实验内版本号，从 `1` 开始 |
| `name` | string | 训练/实验名称 |
| `modelVersionId` | string | 关联模型版本 ID |
| `codeVersionId` | string | 代码版本标识，如 Git commit hash、镜像 tag、代码包版本 |
| `datasetVersionId` | string | 数据集版本 ID |
| `hyperParams` | object | 超参数 JSON |
| `status` | string | 状态：`pending`、`running`、`success`、`failed`、`stopped` |
| `progress` | number | 进度，当前为后端根据状态返回的简化值 |
| `remark` | string | 备注 |
| `createdAt` | string | 创建时间 |
| `updatedAt` | string | 更新时间 |
| `createTime` | string | 兼容前端任务列表的创建时间字段 |

### 发起训练任务

`POST /api/task/create`

说明：该接口会自动生成唯一 `experimentId`，并创建 `versionNo=1` 的实验版本记录。

请求体：

```json
{
  "name": "resnet50-cifar10-train",
  "modelVersionId": "model-ver-xxxxxxxx",
  "codeVersionId": "git-commit-a1b2c3d",
  "datasetVersionId": "dataset-ver-xxxxxxxx",
  "hyperParams": {
    "epochs": 10,
    "batch_size": 32,
    "learning_rate": 0.001
  },
  "remark": "baseline"
}
```

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 否 | 训练/实验名称 |
| `modelVersionId` | string | 是 | 模型版本 ID |
| `codeVersionId` | string | 是 | 代码版本标识 |
| `datasetVersionId` | string | 是 | 数据集版本 ID |
| `hyperParams` | object/string | 是 | 超参数配置；也兼容字段名 `params` |
| `remark` | string | 否 | 备注 |

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "train-ver-xxxxxxxx",
    "experimentId": "exp-1710000000000-abc123def456",
    "versionNo": 1,
    "name": "resnet50-cifar10-train",
    "modelVersionId": "model-ver-xxxxxxxx",
    "codeVersionId": "git-commit-a1b2c3d",
    "datasetVersionId": "dataset-ver-xxxxxxxx",
    "hyperParams": {
      "epochs": 10,
      "batch_size": 32,
      "learning_rate": 0.001
    },
    "status": "pending",
    "progress": 0,
    "remark": "baseline",
    "createdAt": "2026-04-18T04:30:00Z",
    "updatedAt": "2026-04-18T04:30:00Z",
    "createTime": "2026-04-18T04:30:00Z"
  },
  "errorMessage": null
}
```

等价入口：`POST /api/experiments`，请求体和响应一致。

强类型校验：

- 后端会根据 `modelVersionId` 查询模型版本所属模型资产的 `type`。
- 后端会根据 `datasetVersionId` 查询数据集版本所属数据集资产的 `type`。
- 两者必须同为 `CV` 或同为 `NLP`，否则拒绝创建训练实验。

错配失败响应示例：

```json
{
  "success": false,
  "data": null,
  "errorMessage": "模型类型与数据集类型不匹配：模型为 CV，数据集为 NLP"
}
```

### 获取训练任务列表

`GET /api/task/list`

说明：每个 `experimentId` 只返回最新一条版本记录，适合任务列表页展示。

成功响应：

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "train-ver-xxxxxxxx",
        "experimentId": "exp-1710000000000-abc123def456",
        "versionNo": 1,
        "name": "resnet50-cifar10-train",
        "modelVersionId": "model-ver-xxxxxxxx",
        "codeVersionId": "git-commit-a1b2c3d",
        "datasetVersionId": "dataset-ver-xxxxxxxx",
        "hyperParams": {
          "epochs": 10
        },
        "status": "pending",
        "progress": 0,
        "createdAt": "2026-04-18T04:30:00Z",
        "createTime": "2026-04-18T04:30:00Z"
      }
    ],
    "total": 1
  },
  "errorMessage": null
}
```

### 获取训练任务详情

`GET /api/task/detail?id={id}`

Query 参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 可传实验版本记录 ID，也可传 `experimentId`；传 `experimentId` 时返回该实验最新版本 |

响应：`ApiResponse<TrainingExperimentVersion>`

### 终止训练任务

`POST /api/task/stop?id={id}`

说明：将指定版本记录或指定实验最新版本的状态改为 `stopped`。

响应：`ApiResponse<TrainingExperimentVersion>`

### 删除训练任务

`DELETE /api/task/delete?id={id}`

说明：可传实验版本记录 ID 或 `experimentId`。删除时会删除该实验下所有历史版本记录。

响应：

```json
{
  "success": true,
  "data": null,
  "errorMessage": null
}
```

### 按实验 ID 查看历史版本

`GET /api/experiments/{experimentId}/versions`

成功响应：

```json
{
  "success": true,
  "data": [
    {
      "id": "train-ver-xxxxxxxx",
      "experimentId": "exp-1710000000000-abc123def456",
      "versionNo": 1,
      "codeVersionId": "git-commit-a1b2c3d",
      "datasetVersionId": "dataset-ver-xxxxxxxx",
      "hyperParams": {
        "epochs": 10,
        "batch_size": 32
      }
    }
  ],
  "errorMessage": null
}
```

### 查看指定实验版本

`GET /api/experiments/{experimentId}/versions/{versionNo}`

响应：`ApiResponse<TrainingExperimentVersion>`

### 创建实验新版本

`POST /api/experiments/{experimentId}/versions`

说明：在已有实验下创建新的版本记录，`versionNo` 自动递增。不传的字段会继承该实验最新版本。

请求体：

```json
{
  "codeVersionId": "git-commit-d4e5f6g",
  "datasetVersionId": "dataset-ver-yyyyyyyy",
  "hyperParams": {
    "epochs": 20,
    "batch_size": 64,
    "learning_rate": 0.0005
  },
  "remark": "调大学习轮次"
}
```

响应：`ApiResponse<TrainingExperimentVersion>`

说明：如果新版本更换了 `modelVersionId` 或 `datasetVersionId`，后端同样会执行 CV/NLP 类型匹配校验。

### 修改指定版本的超参数

`PUT /api/experiments/{experimentId}/versions/{versionNo}/hyper-parameters`

请求体：

```json
{
  "hyperParams": {
    "epochs": 30,
    "batch_size": 64,
    "learning_rate": 0.0003
  },
  "remark": "修改 versionNo=2 的超参数"
}
```

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hyperParams` | object/string | 是 | 新的超参数配置；也兼容字段名 `params` |
| `remark` | string | 否 | 修改备注 |

响应：`ApiResponse<TrainingExperimentVersion>`

说明：该接口会修改指定 `versionNo` 的超参数配置，并更新 `updatedAt`。如果希望保留原版本不变，前端应使用「创建实验新版本」接口生成新的 `versionNo`。

## 前端推荐对接方式

### 模型上传推荐流程

```ts
const initRes = await modelUploadInit({
  fileName: file.name,
  fileSize: file.size,
  fileFingerprint,
});

const { uploadId, chunkSize, totalChunks, uploadedPartIndexes } = initRes.data;
const uploaded = new Set(uploadedPartIndexes);

for (let partIndex = 0; partIndex < totalChunks; partIndex += 1) {
  if (uploaded.has(partIndex)) continue;
  const start = partIndex * chunkSize;
  const end = Math.min(file.size, start + chunkSize);
  const chunk = file.slice(start, end);
  await modelUploadChunk(uploadId, partIndex, chunk);
}

await modelUploadComplete({
  uploadId,
  modelName: 'resnet50',
  version: 'v1.0.0',
  type: 'CV',
  remark: 'ImageNet 预训练模型',
});
```

刷新后续传：

- 前端把 `uploadId` 和 `fileFingerprint` 存到 `localStorage`。
- 刷新后恢复表单，用户重新选择同一个文件。
- 再次调用 init 或 `/api/model/upload/progress` 获取 `uploadedPartIndexes`，跳过已上传分片继续上传。

### 数据集上传推荐流程

```ts
const initRes = await datasetUploadInit({
  fileName: file.name,
  fileSize: file.size,
  fileFingerprint,
  datasetName: 'cifar10',
  version: 'v1',
  type: 'CV',
  remark: '图像分类数据集',
});

const { uploadId, chunkSize, totalChunks, uploadedPartIndexes } = initRes.data;
const uploaded = new Set(uploadedPartIndexes);

for (let partIndex = 0; partIndex < totalChunks; partIndex += 1) {
  if (uploaded.has(partIndex)) continue;
  const start = partIndex * chunkSize;
  const end = Math.min(start + chunkSize, file.size);
  await datasetUploadChunk(uploadId, partIndex, file.slice(start, end));
}

await datasetUploadComplete(uploadId);
```

刷新后续传：

- 前端把 `uploadId` 和 `fileFingerprint` 存到 `localStorage`。
- 刷新后恢复表单，用户重新选择同一个文件。
- 再次调用 init 或 progress 获取 `uploadedPartIndexes`，跳过已上传分片继续上传。

### 训练实验推荐流程

```ts
const createRes = await createTrainingTask({
  name: 'resnet50-cifar10-train',
  modelVersionId: 'model-ver-xxxxxxxx',
  codeVersionId: 'git-commit-a1b2c3d',
  datasetVersionId: 'dataset-ver-xxxxxxxx',
  hyperParams: {
    epochs: 10,
    batch_size: 32,
    learning_rate: 0.001,
  },
});

const { experimentId } = createRes.data;

const historyRes = await listExperimentVersions(experimentId);

await updateExperimentHyperParams(experimentId, 1, {
  hyperParams: {
    epochs: 20,
    batch_size: 64,
    learning_rate: 0.0005,
  },
});
```

## 当前实现注意事项

- 登录为演示逻辑，当前没有 Session/JWT 鉴权。
- 模型和数据集分片上传状态保存在数据库中，前端可通过 `fileFingerprint` 和 `uploadedPartIndexes` 恢复未完成上传。
- 模型完成上传时会同时创建新的模型资产和模型版本，不会复用同名资产。
- 模型资产 CRUD 删除接口只删数据库记录；模型展示删除接口 `/api/model/delete` 会尝试删除 MinIO 文件。数据集资产和数据集版本删除接口会同步删除对应 MinIO 文件，失败时不删除数据库记录。
- 模型和数据集的 `type` 字段只允许 `CV` 或 `NLP`，其他值会被后端拒绝。
- 数据集上传会执行基础格式校验：CV 为包含图片的 zip 或图片文件夹，NLP 为 `.txt`、`.json`、`.jsonl` 或包含这些文件的 zip。
- 发起训练时必须同时提供 `modelVersionId` 和 `datasetVersionId`，后端会阻止 CV 模型关联 NLP 数据集，或 NLP 模型关联 CV 数据集。
- 训练任务当前只记录实验版本元数据，不会真正调度训练作业；后续可在 `/api/task/create` 后接入训练调度器。
- 实验超参数以 JSON 文本存库，返回时会反序列化为 JSON 对象。
- 当前列表接口未做分页；如后续数据量增大，建议新增 `page`、`pageSize`、`keyword` 等参数。
