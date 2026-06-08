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

当前 `WebConfig` 会拦截全部 `/api/**` 请求，因此包括 `/api/files/health` 在内的模块二接口都需要登录态。普通用户只能访问自己的资源；`roleId` 为 `1` 或 `2` 的管理员可访问全部资源，但个别写入接口有更严格的所有者限制，具体见对应章节。

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
- 未登录时，请求会先被拦截器拦截，HTTP 状态为 `401`，响应体是模块一 `Result` 格式，例如 `{"code":401,"message":"请先登录","data":null}`，不会进入模块二 Controller。
- 图片流、点云流和通用下载接口成功时返回二进制流；失败时返回 JSON，前端不能固定按 JSON 解析这些接口。

### 1.3 枚举

任务类型 `type`：

| 值 | 说明 |
| --- | --- |
| `CV` | 计算机视觉 |
| `NLP` | 自然语言处理 |
| `POINT_CLOUD` | 点云数据 |
| `ROBOT` | 机器人数据，类型预留 |

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

CV 数据集未传 `cvTaskType` 时默认归一化为 `UNLABELED`，未传 `annotationFormat` 时默认归一化为 `NONE`。非 CV 数据集的这两个字段会归一化为 `null`。

数据集版本状态：

| 值 | 说明 |
| --- | --- |
| `DRAFT` | 草稿元数据，不能预览或训练 |
| `READY` | 可作为当前版本、可预览、可用于创建训练 |
| `DEPRECATED` | 历史版本，可预览但不能创建新训练 |
| `ARCHIVED` | 归档版本，不能预览或训练 |

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

### 1.5 前端统一接入方式

1. 前端先调用模块一 `POST /api/user/login` 登录，从 `data.token` 取得令牌。
2. 后续模块二请求统一携带 `Authorization: Bearer <token>`。如果使用 Cookie 登录态，跨域请求还需要启用 `credentials`。
3. 普通 JSON 接口先判断 HTTP 状态，再判断响应体 `success`；不能只以 HTTP `200` 作为业务成功。
4. 文件流接口应使用 `blob` 或 `arrayBuffer` 接收。若响应 `Content-Type` 为 `application/json`，说明后端返回了错误对象，不应继续交给预览器解析。
5. 前端保存和传递业务 ID 时要区分资产 ID 与版本 ID。训练、模型代码预览、数据集内容预览和点云预览都使用版本 ID。
6. `previewUrl` 是受鉴权保护的相对 URL。使用 `<img>`、Three.js Loader 等不会自动附加 Axios 拦截器请求头的组件时，应先用带令牌的 `fetch`/请求库取得 `Blob` 或 `ArrayBuffer`，再交给组件解析。
7. 列表接口中的 `page` 和 `current` 都从 `1` 开始；同时传入时 `current` 优先。模型和数据集主列表未传 `pageSize` 时会返回全部数据。
8. zip entry 路径必须直接使用后端返回的 `path`，作为查询参数时使用 URL 编码，不要自行拼接或规范化。
9. 当前 CORS 配置只允许 `GET`、`POST`、`PUT`、`DELETE`、`OPTIONS`，没有允许 `PATCH`。跨域前端调用 `PATCH /api/dataset-versions/{id}/status` 会在预检阶段失败；当前部署应通过同源反向代理调用，或在后端补充 `PATCH` 后再开放跨域状态编辑。

登录示例：

```ts
const loginResponse = await fetch('/api/user/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'account',
    username: 'admin',
    password: 'password123',
  }),
});
const loginResult = await loginResponse.json();
const token = loginResult.data.token;

const response = await fetch('/api/dataset/list?page=1&pageSize=20', {
  headers: { Authorization: `Bearer ${token}` },
});
const result = await response.json();
if (!response.ok || !result.success) {
  throw new Error(result.errorMessage || result.message || '请求失败');
}
```

### 1.6 推荐业务流程

#### 模型上传

新模型直接上传：

```text
/api/model/upload/init
  -> 按 uploadedPartIndexes 补传 /chunk
  -> /progress 确认全部分片
  -> /complete（不传 assetId）
  -> 保存返回的 assetId 和 id(modelVersionId)
```

给已有模型增加版本：

```text
/api/model-assets 或已有业务数据取得 assetId
  -> /api/model/upload/init
  -> /chunk
  -> /complete（传 assetId 和新 version）
  -> 使用返回的 id 作为新 modelVersionId
```

上传分片允许按同一 `partIndex` 重试。`complete` 对已经完成的 `uploadId` 可重复调用并返回原结果。`fileFingerprint` 只用于恢复未完成会话，不是后端文件完整性校验值。

#### 数据集上传

```text
/api/dataset/upload/init
  -> /chunk
  -> /progress
  -> /complete
  -> 使用返回的 id/versionId 进行预览或训练
```

- 不传 `assetId` 时创建新数据集资产；传入 `assetId` 时给已有资产创建新版本。
- CV 本地文件夹可使用 `/api/dataset/upload/folder` 一次提交，后端会打包为 zip；大文件仍建议使用分片流程。
- 上传成功的新版本为 `READY`，并自动成为资产的 `currentVersionId`。
- 上传到已有数据集时，`type`、`cvTaskType`、`annotationFormat` 必须和资产一致。

#### 数据集预览

```text
/api/dataset/list 取得 versionId
  -> CV/NLP 调用 /api/dataset/preview/files
  -> 使用 files[].previewUrl 查看文本、CSV 或图片
```

```text
/api/dataset/list?type=POINT_CLOUD 取得 versionId
  -> /api/dataset/point-cloud/preview
  -> 单文件使用 previewUrl
  -> zip 展示 pointCloudFiles，选择 previewAllowed=true 的 previewUrl
```

#### 训练实验

```text
准备 modelVersionId、datasetVersionId、codeVersionId、hyperParams
  -> POST /api/task/create 或 POST /api/experiments
  -> GET /api/task/detail 轮询最新状态
  -> 需要保留实验历史时使用 /api/experiments/{experimentId}/versions
```

创建训练后，服务会在数据库事务提交后异步启动本地训练。当前训练实现会读取 YOLO zip 中的图片和 `labels/` 下 `.txt` 标签；类型匹配通过并不代表任意格式都能被当前本地训练器实际解析。

### 1.7 接口速查与前端注意事项

以下表格覆盖当前模块二 Controller 中的全部接口。详细字段仍以各章节为准。

#### 模型接口

| 接口 | 前端用途 | 注意事项 |
| --- | --- | --- |
| `POST /api/model/upload/init` | 创建或恢复模型上传会话 | 仅接受 `.zip`；保存返回的 `uploadId`、`chunkSize`、`totalChunks` |
| `POST /api/model/upload/chunk` | 上传单个模型分片 | `partIndex` 从 `0` 开始；非末片必须等于 `chunkSize`；可重传同一分片 |
| `GET /api/model/upload/progress` | 断点续传和进度恢复 | 以 `uploadedPartIndexes` 判断缺失分片，不要只用 `uploadedChunks` |
| `POST /api/model/upload/complete` | 合并模型文件并创建版本 | 所有分片完成后调用；已有资产模式传 `assetId`；重复调用已完成会话会返回原结果 |
| `GET /api/model/list` | 模型版本主列表 | 返回项是一条模型版本，不是一条资产；`id` 是 `modelVersionId` |
| `GET /api/model/detail` | 模型版本详情 | 查询参数 `id` 必须是模型版本 ID |
| `GET /api/model/code-files` | 列出模型 zip 中可预览代码 | 最多返回 500 个白名单代码/文本文件 |
| `GET /api/model/previewCode` | 在线查看模型代码文本 | `path` 使用 `code-files` 返回值；单文件超过 1MB 会拒绝 |
| `DELETE /api/model/delete` | 从模型版本列表删除版本 | 与 `/api/model-versions/{id}` 删除行为基本一致；被训练引用时拒绝 |
| `POST /api/model-assets` | 预创建空模型资产 | 创建后还没有可训练文件；后续通过 upload complete 的 `assetId` 挂版本 |
| `GET /api/model-assets/{id}` | 查询模型资产元数据 | `id` 是资产 ID，不是版本 ID |
| `GET /api/model-assets` | 获取可选模型资产 | 无分页；普通用户只看到自己的未删除资产 |
| `PUT /api/model-assets/{id}` | 编辑模型名称、类型、备注 | 修改 `type` 会影响该资产所有版本的训练类型判断，前端应二次确认 |
| `DELETE /api/model-assets/{id}` | 删除资产和全部版本 | 软删除元数据，MinIO 异步清理；任一版本被训练引用时整体拒绝 |
| `POST /api/model-versions` | 手工创建模型版本元数据 | 不上传文件；普通用户不能提交存储字段，生产上传流程优先使用 `/api/model/upload/**` |
| `GET /api/model-versions/{id}` | 查询原始版本实体 | 用于版本管理页，不替代 `/api/model/detail` 的聚合详情 |
| `GET /api/model-versions` | 查询资产下版本 | 传 `assetId` 获取指定资产版本；当前无分页 |
| `PUT /api/model-versions/{id}` | 修改版本号或管理员维护元数据 | 普通用户不能改资产和存储字段；管理员代码路径允许修改这些字段 |
| `DELETE /api/model-versions/{id}` | 删除指定模型版本 | 软删除；被训练引用时拒绝；MinIO 清理由任务异步执行 |

#### 数据集接口

| 接口 | 前端用途 | 注意事项 |
| --- | --- | --- |
| `POST /api/dataset/upload/init` | 创建或恢复数据集上传会话 | 文件类型在初始化时校验；`ROBOT` 当前会被拒绝 |
| `POST /api/dataset/upload/chunk` | 上传数据集分片 | 分片规则与模型一致；按 `uploadedPartIndexes` 支持续传 |
| `GET /api/dataset/upload/progress` | 查询上传进度和版本预分配信息 | 完成后可取得 `assetId`、`versionId`、`versionNo`、`versionLabel` |
| `POST /api/dataset/upload/complete` | 合并文件并创建 READY 版本 | 只提交 `uploadId`；数据集元数据已在 init 阶段固定 |
| `POST /api/dataset/upload/folder` | 上传 CV 文件夹 | `files` 与 `paths` 必须一一对应；后端同步打包上传，不适合超大文件夹 |
| `GET /api/dataset/list` | 数据集资产主列表 | 每条记录代表资产并携带当前推荐版本；预览/训练使用 `versionId` |
| `POST /api/dataset-assets` | 预创建空数据集资产 | 只创建资产元数据；没有版本时列表中的版本字段为空 |
| `GET /api/dataset-assets/{id}` | 查询数据集资产元数据 | `id` 是资产 ID |
| `GET /api/dataset-assets` | 获取可选数据集资产 | 无分页；适合上传“新增版本”时的资产选择器 |
| `PUT /api/dataset-assets/{id}` | 编辑名称、类型和 CV 元数据 | 改动会影响后续上传匹配和训练类型判断，前端应谨慎开放 |
| `PUT /api/dataset-assets/{id}/current-version` | 切换列表默认版本 | 目标版本必须属于该资产且状态为 `READY` |
| `DELETE /api/dataset-assets/{id}` | 删除资产及其版本 | 当前版本也会随资产整体软删除；任一版本被训练引用时拒绝 |
| `POST /api/dataset-versions` | 管理员创建 DRAFT 元数据版本 | 普通用户必定被拒绝；不能携带存储元数据；不会上传文件 |
| `GET /api/dataset-versions/{id}` | 查询完整版本实体 | 预览和训练仍传这里返回的版本 `id` |
| `GET /api/dataset-versions` | 获取版本历史 | 传 `assetId` 时按 `versionNo` 倒序；不传时当前无统一排序和分页 |
| `PUT /api/dataset-versions/{id}` | 编辑版本标签和说明 | `fileName`、`storagePath`、`sizeBytes` 对所有角色都不可通过此接口修改 |
| `PATCH /api/dataset-versions/{id}/status` | 发布、废弃或归档版本 | 跨域时受当前 CORS 缺少 `PATCH` 限制；当前版本不能废弃或归档 |
| `DELETE /api/dataset-versions/{id}` | 删除非当前版本 | 当前版本或被训练引用的版本不能删除 |

#### 训练、文件和预览接口

| 接口 | 前端用途 | 注意事项 |
| --- | --- | --- |
| `POST /api/task/create` | 创建训练实验首版本 | 必须传三类版本 ID 和超参数；模型与数据集类型必须一致 |
| `GET /api/task/list` | 训练任务主列表 | 每个 `experimentId` 只返回最新版本；当前无分页 |
| `GET /api/task/detail` | 查询任务详情或轮询状态 | `id` 可为训练版本 ID 或实验 ID；实验 ID 返回最新版本 |
| `POST /api/task/stop` | 标记任务停止 | 代码直接更新状态，不负责中断已经启动的后台线程 |
| `POST /api/task/result` | 外部训练器回写结果 | `id` 可为训练版本 ID 或实验 ID；`progress` 范围为 0 到 100 |
| `DELETE /api/task/delete` | 删除整个实验 | 无论传实验 ID 还是其版本 ID，都会删除该实验全部版本 |
| `POST /api/experiments` | 创建实验首版本 | 与 `/api/task/create` 使用同一服务逻辑 |
| `GET /api/experiments/{experimentId}/versions` | 查询实验全部版本 | 按 `versionNo` 升序；无权限的数据会返回空数组 |
| `GET /api/experiments/{experimentId}/versions/{versionNo}` | 查询指定实验版本 | `versionNo` 是整数，不是训练版本 ID |
| `POST /api/experiments/{experimentId}/versions` | 基于最新版本创建下一版 | 未传字段继承最新版本；新版本自动启动本地训练 |
| `PUT /api/experiments/{experimentId}/versions/{versionNo}/hyper-parameters` | 修改指定版本超参数 | 修改后不会自动重新启动训练；需要新一次训练时应创建实验新版本 |
| `PUT /api/experiments/{experimentId}/versions/{versionNo}/result` | 精确回写指定实验版本结果 | 适合训练执行器按实验 ID 和版本号回调 |
| `GET /api/files/health` | 检查 MinIO 连通性 | 当前也需要登录；只检查后端到 MinIO，不代表具体对象存在 |
| `POST /api/files/upload` | 上传通用对象 | 普通用户对象会放到自己的 `users/{id}/files/` 前缀；不创建模型或数据集元数据 |
| `GET /api/files/download` | 按对象路径下载 | 当前必须传 `objectName`；成功为附件流，错误 HTTP 状态为 `404` |
| `DELETE /api/files/delete` | 异步删除通用对象 | 只返回删除任务已入队，不表示 MinIO 对象已经物理删除 |
| `GET /api/dataset/preview/files` | 获取 CV/NLP 可预览文件清单 | 先调用此接口，再使用后端返回的 `previewUrl` |
| `GET /api/dataset/preview/content` | 查看文本、JSON、JSONL、XML、CSV | zip 数据集必须传 `path`；NLP 单文件必须不传 `path` |
| `GET /api/dataset/preview/image` | 获取 CV zip 内图片流 | 只支持 CV zip；图片超过 20MB 默认限制时拒绝 |
| `GET /api/dataset/point-cloud/preview` | 获取点云预览元信息 | 单文件返回 `previewUrl`；zip 返回 `pointCloudFiles` |
| `GET /api/dataset/point-cloud/file` | 获取单文件 PCD/PLY 流 | 只接受原始文件为 `.pcd` 或 `.ply` 的版本 |
| `GET /api/dataset/point-cloud/zip-file` | 获取 zip 内单个 PCD/PLY 流 | `path` 必须来自预览接口并 URL 编码；默认单文件上限 200MB |

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
| `assetId` | string | 否 | 已有模型资产 ID；不传时创建新资产，传入时给已有资产新增版本 |
| `modelName` | string | 条件必填 | 创建新资产时必填；使用已有资产时可省略，若传入则必须与资产名称一致 |
| `version` | string | 是 | 模型版本号 |
| `type` | string | 条件必填 | 创建新资产时必填；使用已有资产时可省略，若传入则必须与资产类型一致 |
| `remark` | string | 条件必填 | 创建新资产时必填；使用已有资产时可省略且不会更新资产备注 |

创建新模型资产并上传首个版本：

```json
{
  "uploadId": "model-upload-1710000000000-abc",
  "modelName": "ResNet50",
  "version": "v1",
  "type": "CV",
  "remark": "baseline model"
}
```

前端注意事项：

- `fileFingerprint` 相同且 `fileName`、`fileSize` 一致时，后端只会复用状态为 `UPLOADING` 的会话。
- 指纹仅用于查找可续传会话，后端不会用它重新计算并校验合并后文件哈希。
- 前端重新进入上传页面时，可以再次调用 init，再根据返回的 `uploadedPartIndexes` 只上传缺失分片。

给已有模型资产上传新版本：

```json
{
  "uploadId": "model-upload-1710000000000-def",
  "assetId": "model-asset-8e2b",
  "version": "v2"
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
- 不传 `assetId` 时，后端创建新的模型资产和首个模型版本，保持原有上传行为。
- 传入 `assetId` 时，后端只在该资产下创建新版本，不修改已有资产的名称、类型、备注和所有者。
- 已有资产模式只允许资产所有者本人完成上传；管理员也不能通过该接口给其他用户的资产代上传版本。
- 同一模型资产下 `version` 唯一，包括已经软删除的历史版本；重复版本会返回明确错误。
- 已完成的 `uploadId` 重复调用完成接口时，返回第一次完成生成的资产和版本，不会重复创建。
- 模型最终对象路径按 `users/{asset.ownerUserId}/models/{assetId}/{version}/{fileName}` 生成。
- 模型 zip 必须为合法非空压缩包；zip 内路径不能包含绝对路径、盘符、`..` 或空字节。
- 模型 zip 当前最多检查 `100000` 个条目，解压后累计内容不能超过 `50GB`。
- complete 执行期间状态为 `COMPLETING`，前端不要并发重复发起合并；收到“正在合并”提示时应改为轮询 progress。

## 3. 模型查询接口

基础路径：`/api/model`

### 3.1 查询模型列表

```http
GET /api/model/list
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 否 | `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT` |
| `keyword` | string | 否 | 按模型名称、版本、备注、文件名模糊搜索 |
| `page` | integer | 否 | 页码，从 `1` 开始 |
| `current` | integer | 否 | 页码；优先级高于 `page` |
| `pageSize` | integer | 否 | 每页数量；不传则返回全部 |

前端查询对接说明：

- 模型名称输入框应传 `keyword`，后端会按模型名称、版本、备注、文件名做不区分大小写的模糊搜索。
- 类型下拉框应传 `type`，取值为 `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT`。
- 如果前端表单字段名是 `modelName` 或 `name`，提交请求前需要映射为 `keyword`。
- 示例：`GET /api/model/list?keyword=resnet&type=CV&page=1&pageSize=10`。

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

前端注意事项：

- 仅支持模型原始文件为 zip 的版本。
- 后端只返回代码/文本扩展名白名单中的文件，最多返回 `500` 项，并按 `path` 排序。
- 该接口不会返回权重、图片或任意二进制文件。

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

前端注意事项：

- `path` 应直接使用 `/api/model/code-files` 返回值，并进行 URL 编码。
- 后端按 UTF-8 文本读取；单个文件超过 `1MB` 会返回 `success=false`。
- 前端代码编辑器应按纯文本展示，不应执行返回内容中的 HTML、脚本或命令。

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
| `type` | string | 是 | `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT` |
| `remark` | string | 否 | 备注 |

注意：即使客户端传入 `id`、`ownerUserId`、`deleted` 等字段，后端创建时也会重新生成 `id`，并使用当前登录用户作为 `ownerUserId`。

该接口可以先创建一个没有版本的模型资产。前端随后上传模型文件时，在
`POST /api/model/upload/complete` 中传入返回的 `id` 作为 `assetId`，即可为该资产创建首个或后续模型版本。

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
| `type` | string | 是 | `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT` |
| `remark` | string | 否 | 备注 |

只更新 `name`、`type`、`remark` 和 `updatedAt`。

该接口是完整 `PUT` 更新：前端应回传当前 `name`、`type` 和 `remark`，不要只提交单个改动字段。修改资产 `type` 会改变其全部模型版本的训练类型判断。

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

普通用户不能通过该接口写入 `storagePath`、`fileName`、`sizeBytes`，这些存储元数据通常应由上传服务生成。当前代码允许管理员在该接口中写入存储元数据。

注意：创建时后端会忽略客户端传入的 `id`，重新生成 `model-ver-...`。

该接口只创建模型版本元数据，不上传模型文件，也不写入 MinIO，不等同于
`/api/model/upload/**` 上传流程。

前端建议：普通业务页面不要使用该接口代替模型上传。没有真实文件和存储路径的版本仍会出现在版本 CRUD 查询中，后续本地训练读取文件时会失败。

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
| `fileName` | string | 否 | 普通用户只读；管理员当前可修改 |
| `storagePath` | string | 否 | 普通用户只读；管理员当前可修改 |
| `sizeBytes` | number | 否 | 普通用户只读；管理员当前可修改 |

普通用户不能修改存储元数据，也不能把版本移动到其他资产。管理员当前可以修改目标资产和存储元数据，因此管理端应将该能力视为运维能力，不建议在普通编辑表单中暴露。

管理员调用时，代码会直接用请求体的 `fileName`、`storagePath`、`sizeBytes` 覆盖原值；若省略会被写成 `null`。管理端更新版本号时必须同时回传需要保留的存储元数据。

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
| `assetId` | string | 否 | 已有数据集资产 ID；不传时创建新资产 |
| `datasetName` | string | 条件必填 | 创建新资产时必填；传 `assetId` 时使用已有资产名称 |
| `version` | string | 否 | 兼容的版本展示标签 |
| `versionLabel` | string | 否 | 优先使用的版本展示标签；不传时自动生成 `v{versionNo}` |
| `description` | string | 否 | 当前版本说明 |
| `changeLog` | string | 否 | 相对父版本的变更说明 |
| `parentVersionId` | string | 否 | 父版本 ID；已有资产模式默认使用当前版本 |
| `type` | string | 是 | `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT`；上传流程当前实现 `CV`、`NLP`、`POINT_CLOUD` |
| `cvTaskType` | string | 否 | CV 子任务；非 CV 会被置为 `null` |
| `annotationFormat` | string | 否 | CV 标注格式；非 CV 会被置为 `null` |
| `remark` | string | 否 | 备注 |

文件类型规则：

| 类型 | 规则 |
| --- | --- |
| `CV` | 分片上传只支持 `.zip`；zip 内必须至少包含 `.jpg`、`.jpeg`、`.png`、`.bmp`、`.gif`、`.webp`、`.tif` 或 `.tiff` 图片 |
| `NLP` | 支持 `.txt`、`.json`、`.jsonl`、`.csv`、`.xlsx`、`.xls`、`.pdf`、`.docx`、`.xml`，或只包含这些文件的 `.zip` |
| `POINT_CLOUD` | 支持单文件 `.ply`、`.pcd`，或 `.zip`；zip 内至少包含一个 `.ply` 或 `.pcd`，且仅允许 `.ply`、`.pcd`、`.txt`、`.json`、`.yaml`、`.yml` |

CV zip 中的非图片文件会按照 `annotationFormat` 过滤：

| `annotationFormat` | 允许的标注文件 | 是否至少需要一个标注文件 |
| --- | --- | --- |
| `NONE`、`FOLDER_CLASSIFICATION`、`MASK` | 不允许非图片文件 | 否 |
| `CSV` | `.csv` | 是 |
| `YOLO` | `.txt`、`.yaml`、`.yml` | 是 |
| `COCO`、`LABELME` | `.json` | 是 |
| `VOC` | `.xml` | 是 |
| `OTHER` | `.txt`、`.json`、`.xml`、`.csv`、`.yaml`、`.yml` | 否 |

响应 `data` 字段与模型上传进度类似，额外包含 `cvTaskType`、`annotationFormat`。

版本管理补充：

- `assetId`：初始化上传时可选。为空表示创建新的数据集资产；非空表示给已有数据集资产新增版本。
- `versionNo`：后端生成的真实版本序号，同一 `assetId` 下从 `1` 递增。
- `versionLabel`：展示标签；旧字段 `version` 作为兼容别名。客户端不应依赖 `version` 判断版本顺序。
- `description`：当前版本说明。
- `changeLog`：相对父版本的变更说明。
- `parentVersionId`：父版本 ID；新增到已有资产且不传时默认使用该资产的当前版本。
- 上传完成后新版本默认 `status=READY`，并自动成为 `dataset_asset.currentVersionId`。
- 训练、预览和文件接口继续使用返回的 `id` / `versionId` 作为 `datasetVersionId`，不要使用 `assetId` 或 `versionLabel` 代替。
- 数据集 zip 最多允许 `100000` 个条目，解压后累计内容不能超过 `50GB`。
- `fileFingerprint` 的恢复规则还会比较资产、版本标签、类型和版本说明等上传元数据；这些字段变化后可能会创建新会话。
- 管理员可以给其他用户拥有的数据集资产新增版本，最终对象仍写入该资产所有者的 `users/{ownerUserId}/...` 前缀。模型已有资产上传没有这一管理员代传能力。
- init 阶段返回的 `versionNo` 是当时的预估值；并发上传时应以 complete 最终返回的 `versionNo`、`versionLabel` 为准。
- 自定义 `versionLabel` 在同一资产下必须唯一，已经软删除的历史标签也可能占用唯一值。

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

前端注意事项：

- 响应中的 `status=COMPLETED` 是上传会话状态；数据库中的数据集版本状态为 `READY`。
- complete 可对已完成的 `uploadId` 重试并返回原结果；状态为 `COMPLETING` 时应停止重复提交并轮询 progress。
- 数据集名称、类型和版本说明来自 init 会话，complete 请求只接受 `uploadId`。

### 6.5 上传 CV 文件夹

```http
POST /api/dataset/upload/folder
Content-Type: multipart/form-data
```

表单参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assetId` | string | 否 | 已有数据集资产 ID；不传时创建新资产 |
| `datasetName` | string | 条件必填 | 创建新资产时必填；已有资产模式使用资产名称 |
| `version` | string | 否 | 兼容的版本展示标签 |
| `versionLabel` | string | 否 | 优先使用的版本展示标签 |
| `type` | string | 是 | 必须为 `CV` |
| `cvTaskType` | string | 否 | CV 子任务 |
| `annotationFormat` | string | 否 | CV 标注格式 |
| `remark` | string | 否 | 备注 |
| `description` | string | 否 | 当前版本说明 |
| `changeLog` | string | 否 | 版本变更说明 |
| `parentVersionId` | string | 否 | 父版本 ID |
| `files` | file[] | 是 | 文件列表 |
| `paths` | string[] | 是 | 每个文件对应的相对路径，数量必须与 `files` 一致 |

后端会将文件夹打包为 zip 并生成数据集资产和版本。路径不能是绝对路径、盘符路径，也不能包含 `..` 或空字节。

文件夹上传同样支持 `assetId`、`versionLabel`、`description`、`changeLog`、`parentVersionId`。传 `assetId` 时会在已有数据集资产下创建下一个 `versionNo`，不再创建新的数据集资产。

前端注意事项：

- 浏览器选择目录时应同时提交每个文件的相对路径，不能只提交文件名，否则目录结构和同名文件关系会丢失。
- 路径重复、非法路径、空文件、没有图片、或文件扩展名不符合 `annotationFormat` 时整个请求失败。
- 该接口在一个 multipart 请求中接收全部文件，受 `spring.servlet.multipart` 当前 `64MB` 单请求限制；较大目录应先在客户端压缩后走分片上传。

## 7. 数据集查询接口

基础路径：`/api/dataset`

### 7.1 查询数据集列表

```http
GET /api/dataset/list
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 否 | `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT` |
| `keyword` | string | 否 | 按数据集名称、版本、备注、文件名模糊搜索 |
| `page` | integer | 否 | 页码 |
| `current` | integer | 否 | 页码；优先级高于 `page` |
| `pageSize` | integer | 否 | 每页数量；不传则返回全部 |

前端查询对接说明：

- 数据集名称输入框应传 `keyword`，后端会按数据集名称、版本、数据集备注、版本备注、文件名做不区分大小写的模糊搜索。
- 类型下拉框应传 `type`，取值为 `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT`。
- 如果前端表单字段名是 `datasetName` 或 `name`，提交请求前需要映射为 `keyword`。
- 示例：`GET /api/dataset/list?keyword=casting&type=CV&page=1&pageSize=10`。

列表项字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 数据集资产 ID |
| `assetId` | 数据集资产 ID |
| `name` | 数据集名称 |
| `type` | `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT` |
| `cvTaskType` | CV 子任务 |
| `annotationFormat` | 标注格式 |
| `remark` | 数据集备注 |
| `ownerUserId` | 归属用户 ID |
| `versionId` | 当前推荐数据集版本 ID |
| `version` | 当前推荐版本展示标签 |
| `fileName` | 当前推荐版本文件名 |
| `storagePath` | 当前推荐版本存储路径 |
| `sizeBytes` | 文件大小 |
| `size` | 格式化后的文件大小 |
| `versionRemark` | 版本备注 |
| `fileCount` | 当前资产下未删除版本数量 |
| `uploadTime` | 当前推荐版本上传时间 |
| `createdAt` | 资产创建时间 |
| `updatedAt` | 资产更新时间 |

训练创建时应使用 `versionId` 作为 `datasetVersionId`。

版本字段：

- `versionId` / `currentVersionId`：当前推荐版本 ID。
- `currentVersionNo`：当前推荐版本的后端序号。
- `currentVersionLabel` / `version`：当前推荐版本展示标签。
- `versionStatus`：当前推荐版本状态。
- `versionDescription`：当前推荐版本说明。
- 列表优先使用 `dataset_asset.current_version_id`；如果为空或不可用，则回退到该资产下 `status=READY` 且 `versionNo` 最大的版本。
- `fileCount` 当前实际表示资产下未删除版本数量，不是 zip 内文件数量。

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
| `type` | string | 是 | `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT` |
| `cvTaskType` | string | 否 | CV 子任务；非 CV 可为空 |
| `annotationFormat` | string | 否 | CV 标注格式；非 CV 可为空 |
| `remark` | string | 否 | 备注 |

注意：创建时后端会忽略客户端传入的 `id`，重新生成 `dataset-asset-...`，并使用当前登录用户作为 `ownerUserId`。

该接口只创建数据集资产元数据，不会创建数据集版本或上传文件。前端创建后可将返回的 `id` 作为 `/api/dataset/upload/init` 或 `/api/dataset/upload/folder` 的 `assetId`。

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
| `type` | string | 是 | `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT` |
| `cvTaskType` | string | 否 | CV 子任务；非 CV 可为空 |
| `annotationFormat` | string | 否 | CV 标注格式；非 CV 可为空 |
| `remark` | string | 否 | 备注 |

前端注意事项：当前接口会直接修改资产级 `type`、`cvTaskType` 和 `annotationFormat`，不会同步改写历史版本。资产已有版本后，普通编辑页不建议随意开放类型修改。

该接口是完整 `PUT` 更新，前端应回传当前名称、类型、CV 子任务、标注格式和备注，避免省略字段被清空或按默认值重新归一化。

### 8.5 删除数据集资产

```http
DELETE /api/dataset-assets/{id}
```

删除数据集资产会软删除该资产及其下未删除的数据集版本，并将相关 MinIO 对象加入删除任务。如果任一数据集版本被训练实验引用，删除会失败。

### 8.6 切换当前版本

```http
PUT /api/dataset-assets/{assetId}/current-version
Content-Type: application/json
```

请求体：

```json
{ "versionId": "dataset-ver-xxx" }
```

只能切换到同一数据集资产下、未删除、`status=READY` 的版本。普通用户只能切换自己的数据集，管理员可切换全部。

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
| `versionLabel` | string | 否 | 版本展示标签，优先于 `version` |
| `version` | string | 否 | 兼容的版本展示标签；两者都不传时自动生成 `v{versionNo}` |
| `remark` | string | 否 | 备注 |
| `description` | string | 否 | 版本说明 |
| `changeLog` | string | 否 | 变更说明 |
| `status` | string | 否 | 只能为空或 `DRAFT` |

该接口只允许管理员调用，并且只能创建没有文件的 `DRAFT` 元数据版本。`storagePath`、`fileName`、`sizeBytes` 只要任一非空都会被拒绝。

注意：创建时后端会忽略客户端传入的 `id`，重新生成 `dataset-ver-...`。

前端建议：普通数据集上传和新增版本不要调用此接口，应使用 `/api/dataset/upload/**`。当前接口创建的 DRAFT 没有后续文件挂载接口，不能直接进入预览或训练。

### 9.2 查询数据集版本详情

```http
GET /api/dataset-versions/{id}
```

### 9.3 查询数据集版本列表

```http
GET /api/dataset-versions?assetId={assetId}
```

`assetId` 可选。不传时普通用户返回自己可见数据集资产下的全部未删除版本，管理员返回全部未删除版本；此模式没有显式排序和分页。

传 `assetId` 时按 `versionNo` 倒序返回完整版本历史。返回项包含 `versionNo`、`versionLabel`、`status`、`description`、`changeLog`、`parentVersionId`、`fileFingerprint`、`publishedAt` 等字段。

### 9.4 更新数据集版本

```http
PUT /api/dataset-versions/{id}
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `assetId` | string | 否 | 目标资产 ID；普通用户不能修改 |
| `versionLabel` | string | 条件必填 | 展示标签，优先于 `version` |
| `version` | string | 条件必填 | 兼容字段；`versionLabel` 和 `version` 至少传一个 |
| `remark` | string | 否 | 备注 |
| `description` | string | 否 | 版本说明 |
| `changeLog` | string | 否 | 变更说明 |
| `fileName` | string | 否 | 不可修改 |
| `storagePath` | string | 否 | 不可修改 |
| `sizeBytes` | number | 否 | 不可修改 |

普通用户不能把版本移动到其他资产；管理员可以修改 `assetId`，但目标资产必须存在且可访问。存储元数据对所有角色都不能通过该接口修改。

`remark`、`description`、`changeLog` 会直接使用请求值覆盖，省略时会被更新为 `null`；编辑页应先读取详情并提交完整可编辑字段。

### 9.5 更新数据集版本状态

```http
PATCH /api/dataset-versions/{id}/status
Content-Type: application/json
```

请求体：

```json
{ "status": "READY" }
```

版本状态整体只支持 `DRAFT`、`READY`、`DEPRECATED`、`ARCHIVED`；状态更新接口只允许更新为 `READY`、`DEPRECATED`、`ARCHIVED`。`DRAFT -> READY` 必须已有 `storagePath`、`fileName`、`sizeBytes`。当前版本不能直接改为 `DEPRECATED` 或 `ARCHIVED`，需要先通过当前版本切换接口切到其他 `READY` 版本。

前端注意事项：

- 该接口没有限制只能按固定状态机顺序流转，只限制目标状态和当前版本保护。
- 由于手工创建 DRAFT 时又不能写入存储元数据，按当前公开接口创建的空 DRAFT 通常无法直接变为 READY。
- 跨域部署需要注意当前 CORS 未允许 `PATCH`，建议经同源 Nginx 代理调用。

### 9.6 删除数据集版本

```http
DELETE /api/dataset-versions/{id}
```

如果数据集版本被训练实验引用，删除会失败。当前版本不能删除。删除成功后会软删除版本，并将对象加入 MinIO 删除任务。

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

后端会校验模型版本、数据集版本是否存在且当前用户可访问，并校验模型类型与数据集类型一致；例如 `POINT_CLOUD` 模型只能匹配 `POINT_CLOUD` 数据集，`CV`、`NLP`、`POINT_CLOUD` 之间错配会被拒绝。数据集版本还必须为 `READY` 且 `storagePath` 非空。

当前代码的额外行为：

- `codeVersionId` 只校验非空，没有查询独立代码版本表。
- 创建事务提交后会自动启动 `LocalTrainingRunnerService` 后台线程。
- 当前本地训练器实际只解析 zip 中的图片和路径包含 `labels/` 的 YOLO `.txt` 标签。NLP、POINT_CLOUD 或其他 CV 格式即使通过类型匹配，也可能在异步训练阶段进入 `failed`。
- 创建阶段会确认模型版本和资产存在，但不会提前校验模型版本的 `storagePath`、`fileName`、`sizeBytes`；缺少真实模型文件时任务会创建成功，随后在后台训练中失败。
- 前端创建后应轮询 `/api/task/detail`，不能把创建接口返回的 `pending` 当成训练已经成功启动。

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
| `runId` | MLflow 运行 ID |
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

注意：当前实现只更新数据库状态，没有中断 `LocalTrainingRunnerService` 已启动的后台线程；后台线程仍可能继续运行并再次写回状态。前端可以展示停止请求结果，但不能据此认定计算进程已被强制终止。

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
| `runId` | string | 否 | MLflow 或外部执行器运行 ID |
| `logPath` | string | 否 | 日志路径 |
| `outputPath` | string | 否 | 输出路径 |
| `errorMessage` | string | 否 | 错误信息 |
| `startedAt` | string | 否 | ISO-8601 时间 |
| `finishedAt` | string | 否 | ISO-8601 时间 |
| `remark` | string | 否 | 备注 |

前端注意事项：

- `metrics` 和 `hyperParams` 如果传字符串，必须是合法 JSON 文本。
- 未传 `progress` 但传了 `status` 时，后端会按状态生成默认进度：`success=100`、`running=50`，其他状态为 `0`。
- 回写接口依赖普通登录鉴权和资源所有权，没有单独的回调签名字段。

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

该接口只修改当前实验版本记录，不会自动创建新版本，也不会重新启动训练。需要保留不同参数对应的训练历史时，应使用 `POST /api/experiments/{experimentId}/versions`。

### 11.6 更新实验版本训练结果

```http
PUT /api/experiments/{experimentId}/versions/{versionNo}/result
```

请求体与 `/api/task/result` 相同。

该接口精确定位 `experimentId + versionNo`，比 `/api/task/result?id={experimentId}` 更适合外部执行器回写，避免实验已新增版本后误更新最新版本。

## 12. 通用文件对象接口

基础路径：`/api/files`

通用文件接口主要用于调试或辅助能力。业务流程优先通过模型版本 ID、数据集版本 ID 引用文件。

### 12.1 MinIO 健康检查

```http
GET /api/files/health
```

当前该接口仍经过 `/api/**` 权限拦截，需要有效登录态。它只验证后端能否连接 MinIO，不检查 PostgreSQL、MLflow 或某个具体对象。

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

`objectName` 不能包含控制字符，也不能包含单独的 `.` 或 `..` 路径段。该接口不会创建 `model_asset`、`dataset_asset` 或版本记录，业务模型和数据集不要使用它代替专用上传流程。

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

前端应将查询参数进行 URL 编码，并使用 Blob 下载。该接口当前依赖 `objectName`，不是基于模型版本 ID 或数据集版本 ID 的稳定业务下载接口。

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

## 13. 普通数据集预览接口

基础路径：`/api/dataset/preview`

普通数据集预览用于 CV/NLP 数据集内容查看。点云数据集仍使用 `/api/dataset/point-cloud/**`。

后端只接受 `datasetVersionId`，不接受客户端直接传 `storagePath` 或 MinIO `objectName`。后端会反查 `dataset_version`、`dataset_asset`，校验当前用户是否有权限访问该数据集版本和对象路径。普通用户只能查看自己的数据集，管理员可查看全部。

只有状态为 `READY` 或 `DEPRECATED` 的版本可预览；`DRAFT` 和 `ARCHIVED` 会被拒绝。

在线预览限制由配置项控制：

```yaml
dataset:
  preview:
    max-zip-entries: 10000
    max-text-bytes: 1048576
    max-image-bytes: 20971520
    max-page-size: 200
```

首版支持范围：

| 类型 | 支持在线预览 | 说明 |
| --- | --- | --- |
| CV zip 内图片 | 是 | `.jpg`、`.jpeg`、`.png`、`.bmp`、`.gif`、`.webp`、`.tif`、`.tiff` |
| CV zip 内标注文本 | 是 | `.txt`、`.json`、`.xml`、`.csv` |
| NLP 文本类文件 | 是 | `.txt`、`.json`、`.jsonl`、`.xml` |
| NLP CSV | 是 | 第一行作为 `columns`，后续行分页返回 |
| PDF / DOCX / XLS / XLSX | 否 | 文件清单中展示，提示下载后查看 |

### 13.1 查询普通数据集文件清单

```http
GET /api/dataset/preview/files?id={datasetVersionId}&page=1&pageSize=100&keyword=&kind=
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 数据集版本 ID |
| `page` | number | 否 | 页码，默认 `1` |
| `pageSize` | number | 否 | 每页数量，默认 `100`，最大由 `dataset.preview.max-page-size` 控制 |
| `keyword` | string | 否 | 按文件路径、文件名、扩展名模糊过滤 |
| `kind` | string | 否 | `IMAGE`、`TEXT`、`TABLE`、`UNSUPPORTED` |

响应 `data`：

| 字段 | 说明 |
| --- | --- |
| `datasetVersionId` | 数据集版本 ID |
| `type` | `CV` 或 `NLP` |
| `fileName` | 原始数据集文件名 |
| `sourceArchive` | 原始文件是否为 zip |
| `page` / `pageSize` / `total` | 分页信息 |
| `files` | 文件清单 |

前端注意事项：

- zip 文件清单会扫描整个压缩包后再分页，`pageSize` 只控制返回数量，不减少后端扫描成本。
- `total` 是按 `keyword`、`kind` 过滤后的总数。
- zip entry 未声明大小时 `sizeBytes` 可能为 `null`，实际流式读取时仍会执行大小限制。

`files[]` 字段：

| 字段 | 说明 |
| --- | --- |
| `path` | zip 内相对路径；NLP 单文件数据集为 `null` |
| `fileName` | 文件名 |
| `extension` | 小写扩展名 |
| `kind` | `IMAGE`、`TEXT`、`TABLE`、`UNSUPPORTED` |
| `sizeBytes` | 文件大小；zip entry 无大小信息时可为 `null` |
| `previewAllowed` | 是否允许在线预览 |
| `previewUrl` | 可预览文件的后续预览 URL |
| `message` | 不可预览或受限时的提示 |

示例：

```json
{
  "success": true,
  "data": {
    "datasetVersionId": "dataset-ver-xxx",
    "type": "CV",
    "fileName": "images.zip",
    "sourceArchive": true,
    "page": 1,
    "pageSize": 100,
    "total": 2,
    "files": [
      {
        "path": "images/a.png",
        "fileName": "a.png",
        "extension": ".png",
        "kind": "IMAGE",
        "sizeBytes": 12345,
        "previewAllowed": true,
        "previewUrl": "/api/dataset/preview/image?id=dataset-ver-xxx&path=images%2Fa.png",
        "message": null
      },
      {
        "path": "labels/a.txt",
        "fileName": "a.txt",
        "extension": ".txt",
        "kind": "TEXT",
        "sizeBytes": 128,
        "previewAllowed": true,
        "previewUrl": "/api/dataset/preview/content?id=dataset-ver-xxx&path=labels%2Fa.txt",
        "message": null
      }
    ]
  },
  "errorMessage": null
}
```

### 13.2 预览文本或表格内容

```http
GET /api/dataset/preview/content?id={datasetVersionId}&path={zipEntryPath}&page=1&pageSize=100
```

规则：

- `id` 必须是数据集版本 ID。
- zip 数据集的 `path` 必须来自 `files[].path`。
- NLP 单文件数据集可省略 `path`。
- `.json` 会优先按 JSON 格式化；解析失败时按原文本返回。
- `.csv` 使用第一行作为 `columns`，后续数据行按 `page` / `pageSize` 分页返回，`rows` 只包含当前页。
- `.txt` 和 `.jsonl` 按行分页返回，`content` 只包含当前页行内容；`.jsonl` 会忽略空行。
- `.json` 和 `.xml` 保持结构化内容预览，不做分页，`pageable=false`。
- `pageable=true` 时返回 `total` 和 `totalPages`，前端可据此渲染分页器。
- 文本读取超过 `dataset.preview.max-text-bytes` 时返回前 N 字节，`truncated=true`。
- 文本、JSONL 和 CSV 都先按最大文本字节数截断；`truncated=true` 时 `total` 只代表本次可预览内容中的数量，不代表完整文件总行数。

文本响应示例：

```json
{
  "success": true,
  "data": {
    "path": "labels/a.txt",
    "fileName": "a.txt",
    "extension": ".txt",
    "contentType": "TEXT",
    "content": "0 0.5 0.5 1 1",
    "columns": null,
    "rows": null,
    "page": 1,
    "pageSize": 100,
    "pageable": true,
    "total": 1,
    "totalPages": 1,
    "truncated": false,
    "message": null
  },
  "errorMessage": null
}
```

CSV 响应示例：

```json
{
  "success": true,
  "data": {
    "path": "tables/data.csv",
    "fileName": "data.csv",
    "extension": ".csv",
    "contentType": "CSV",
    "content": null,
    "columns": ["name", "value"],
    "rows": [["a", "1"], ["b", "2"]],
    "page": 1,
    "pageSize": 100,
    "pageable": true,
    "total": 2,
    "totalPages": 1,
    "truncated": false,
    "message": null
  },
  "errorMessage": null
}
```

### 13.3 预览 CV 图片

```http
GET /api/dataset/preview/image?id={datasetVersionId}&path={zipEntryPath}
```

规则：

- 仅支持 `CV` zip 数据集内的图片文件。
- `path` 必须来自 `files[].path`。
- 成功时返回图片流，`Content-Disposition` 为 `inline`。
- 单张图片超过 `dataset.preview.max-image-bytes` 时拒绝在线预览。
- 该接口需要登录。若页面只在请求头保存 token，不能直接把 `previewUrl` 填入 `<img src>`；应先带鉴权头请求 Blob，再创建 `URL.createObjectURL(blob)`。

响应头示例：

```http
Content-Type: image/png
Content-Disposition: inline; filename*=UTF-8''a.png
```

### 13.4 安全与前端对接要求

- 前端必须先调用 `/api/dataset/preview/files`，再使用返回的 `previewUrl`。
- 前端不要直接依赖 `storagePath` 或 MinIO 对象路径。
- zip 内路径不能是绝对路径、盘符路径，不能包含 `..` 或空字节。
- PDF、DOCX、XLS、XLSX 首版不做在线解析，展示下载提示即可。
- `/image` 成功返回二进制流；参数错误通常返回 HTTP `400` JSON，权限错误按隐藏资源策略返回 HTTP `404` JSON。

## 14. 错误处理与安全规则

常见失败原因：

| 场景 | 典型 `errorMessage` |
| --- | --- |
| 未登录 | `请先登录: ...` |
| 无权访问资源 | `not found or no permission: ...` |
| 任务类型非法 | `任务类型仅支持 CV, NLP, POINT_CLOUD, ROBOT` |
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

## 15. 点云三维预览接口

基础路径：`/api/dataset/point-cloud`

点云三维渲染由前端 Three.js、`PCDLoader`、`PLYLoader` 完成。后端只提供基于 `datasetVersionId` 的鉴权、预览元信息和点云文件流，不要求前端直接传 `storagePath` 或 MinIO 对象路径。

只有状态为 `READY` 或 `DEPRECATED` 的数据集版本允许点云预览；`DRAFT` 和 `ARCHIVED` 会被拒绝。

在线预览大小限制由配置项控制：

```yaml
point-cloud:
  preview:
    max-size: 209715200
```

默认单个可预览点云文件不超过 `200MB`。该限制只影响在线预览，不影响上传和原始文件下载。

### 15.1 查询点云预览信息

```http
GET /api/dataset/point-cloud/preview?id={datasetVersionId}
```

规则：
- `id` 必须是数据集版本 ID。
- 后端会查询 `dataset_version` 和 `dataset_asset`，并校验当前用户是否可访问该版本。
- 仅允许 `dataset_asset.type=POINT_CLOUD`。
- 原始文件为 `.pcd` 时返回 `format=PCD` 和单文件 `previewUrl`。
- 原始文件为 `.ply` 时返回 `format=PLY` 和单文件 `previewUrl`。
- 原始文件为 `.zip` 时，后端读取 zip 目录，只返回 zip 内 `.pcd` / `.ply` 文件列表，不直接把整个 zip 作为预览文件。
- zip 内单个 `.pcd` / `.ply` 超过预览大小限制时，该文件仍会出现在 `pointCloudFiles` 中，但 `previewAllowed=false`，`previewUrl=null`，并返回提示信息。
- zip entry 未声明大小时 `sizeBytes` 可能为 `null`，此时元信息阶段会暂时允许预览，但文件流接口仍会在实际解压读取超过 `200MB` 时中止。

单文件 `.pcd` 响应示例：

```json
{
  "success": true,
  "data": {
    "datasetVersionId": "dataset-ver-xxx",
    "fileName": "scan.pcd",
    "type": "POINT_CLOUD",
    "format": "PCD",
    "sizeBytes": 52428800,
    "previewSupported": true,
    "previewUrl": "/api/dataset/point-cloud/file?id=dataset-ver-xxx",
    "pointCloudFiles": null,
    "message": null
  },
  "errorMessage": null
}
```

zip 点云包响应示例：

```json
{
  "success": true,
  "data": {
    "datasetVersionId": "dataset-ver-xxx",
    "fileName": "pointcloud.zip",
    "type": "POINT_CLOUD",
    "format": "ZIP",
    "sizeBytes": 104857600,
    "previewSupported": true,
    "previewUrl": null,
    "pointCloudFiles": [
      {
        "path": "clouds/scan1.pcd",
        "fileName": "scan1.pcd",
        "format": "PCD",
        "sizeBytes": 12345678,
        "previewUrl": "/api/dataset/point-cloud/zip-file?id=dataset-ver-xxx&path=clouds%2Fscan1.pcd",
        "previewAllowed": true,
        "message": null
      }
    ],
    "message": "请选择 zip 内的点云文件进行预览"
  },
  "errorMessage": null
}
```

### 15.2 单文件点云流

```http
GET /api/dataset/point-cloud/file?id={datasetVersionId}
```

用于原始数据集文件就是 `.pcd` 或 `.ply` 的场景。成功时返回文件流：

- `Content-Type: application/octet-stream`
- `Content-Disposition: inline; filename*=UTF-8''...`

前端使用方式：

```ts
const metaResponse = await fetch(
  `/api/dataset/point-cloud/preview?id=${encodeURIComponent(datasetVersionId)}`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const meta = await metaResponse.json();
if (!metaResponse.ok || !meta.success || !meta.data.previewSupported) {
  throw new Error(meta.errorMessage || meta.data?.message || '点云不可预览');
}

const fileResponse = await fetch(meta.data.previewUrl, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!fileResponse.ok) {
  const error = await fileResponse.json();
  throw new Error(error.errorMessage || '点云文件读取失败');
}
const buffer = await fileResponse.arrayBuffer();

if (meta.data.format === 'PCD') {
  const points = new PCDLoader().parse(buffer, meta.data.previewUrl);
  scene.add(points);
} else if (meta.data.format === 'PLY') {
  const geometry = new PLYLoader().parse(buffer);
  // 前端根据 geometry 创建 Points 或 Mesh。
}
```

直接调用 `loader.load(previewUrl)` 时不会自动继承业务请求库中的 `Authorization` 拦截器。只有确认浏览器已携带同源有效 Cookie 时才能省略上述显式鉴权请求。

### 15.3 zip 内点云文件流

```http
GET /api/dataset/point-cloud/zip-file?id={datasetVersionId}&path={zipEntryPath}
```

用于原始数据集文件是 `.zip` 的场景。`path` 必须来自 `preview` 接口返回的 `pointCloudFiles[].path`，后端会再次校验：

- 原始数据集版本必须是 `POINT_CLOUD`。
- 原始文件必须是 `.zip`。
- `path` 不能是绝对路径，不能包含盘符，不能包含 `..`，不能包含空字节。
- `path` 对应的 zip entry 必须存在，且必须是 `.pcd` 或 `.ply`。
- 单个 entry 超过 `point-cloud.preview.max-size` 时拒绝在线预览。

成功时同样返回 `application/octet-stream` 文件流，并设置 `Content-Disposition: inline`。

该接口会把目标 zip entry 解压到后端临时文件，再以流方式返回；前端应避免同时并发加载大量大文件。

### 15.4 前端对接建议

前端先调用：

```http
GET /api/dataset/point-cloud/preview?id={datasetVersionId}
```

如果返回 `previewUrl`：
- `format=PCD` 时使用 `PCDLoader` 加载 `previewUrl`。
- `format=PLY` 时使用 `PLYLoader` 加载 `previewUrl`。

如果返回 `pointCloudFiles`：
- 前端展示 zip 内可预览点云文件列表。
- 用户选择某个 `previewAllowed=true` 的文件后，加载该文件的 `previewUrl`。
- `previewAllowed=false` 的文件展示 `message`，提示下载后本地查看。

如果 `previewSupported=false`：
- 前端展示 `message`。
- 可提供普通下载按钮，但业务预览流程不应直接依赖 `storagePath`。

点云文件流接口参数错误通常返回 HTTP `400` JSON；无权限按隐藏资源策略返回 HTTP `404` JSON。前端在调用 `arrayBuffer()` 前应先检查状态码和 `Content-Type`。

### 15.5 错误场景

| 场景 | 典型错误 |
| --- | --- |
| `id` 为空 | `datasetVersionId 不能为空` |
| 数据集版本不存在或越权 | `dataset version not found or no permission` |
| 非 `POINT_CLOUD` 数据集 | `点云预览仅支持 POINT_CLOUD 数据集` |
| 单文件不是 `.ply` / `.pcd` | `仅支持直接预览 .ply 或 .pcd 点云文件` |
| zip 内路径非法 | `zip entry path 非法` |
| zip 内文件不存在 | `zip 内点云文件不存在: ...` |
| 文件超过在线预览大小限制 | `文件过大，请下载后本地查看` |

### 15.6 接口测试示例

```powershell
# 查询单文件或 zip 点云预览信息
curl.exe -H "Authorization: Bearer <token>" `
  "http://localhost:8080/api/dataset/point-cloud/preview?id=<datasetVersionId>"

# 下载单文件 .pcd/.ply 预览流，响应头应为 inline
curl.exe -I -H "Authorization: Bearer <token>" `
  "http://localhost:8080/api/dataset/point-cloud/file?id=<datasetVersionId>"

# 下载 zip 内指定 .pcd/.ply 预览流，path 需要 URL 编码
curl.exe -I -H "Authorization: Bearer <token>" `
  "http://localhost:8080/api/dataset/point-cloud/zip-file?id=<datasetVersionId>&path=clouds%2Fscan1.pcd"

# 非 POINT_CLOUD 数据集调用 preview 应返回 success=false
curl.exe -H "Authorization: Bearer <token>" `
  "http://localhost:8080/api/dataset/point-cloud/preview?id=<cvOrNlpDatasetVersionId>"

# POINT_CLOUD 列表筛选仍使用原接口
curl.exe -H "Authorization: Bearer <token>" `
  "http://localhost:8080/api/dataset/list?type=POINT_CLOUD"
```

## 16. 数据集版本管理说明

本节补充当前数据集版本管理语义，适用于 `/api/dataset/upload/**`、`/api/dataset-assets/**` 和 `/api/dataset-versions/**`。

### 16.1 版本字段语义

| 字段 | 说明 |
| --- | --- |
| `datasetVersionId` / `id` | 数据集版本主键，训练、预览、点云文件流必须使用该字段引用具体版本。 |
| `assetId` | 数据集资产主键；创建新数据集时为空，给已有数据集新增版本时必须传入。 |
| `versionNo` | 后端生成的真实版本序号，同一 `assetId` 下从 `1` 递增。 |
| `versionLabel` | 展示用版本标签；旧字段 `version` 作为兼容别名继续返回。 |
| `description` | 当前版本说明。 |
| `changeLog` | 相比父版本的变更说明。 |
| `parentVersionId` | 当前版本来源版本；不传时默认使用资产当前版本。 |
| `status` | 版本状态：`DRAFT`、`READY`、`DEPRECATED`、`ARCHIVED`。 |
| `currentVersionId` | 数据集资产当前推荐版本。 |

`versionNo` 是唯一可信的版本序号；前端可以展示 `versionLabel` / `version`，但不要用展示标签做训练或预览引用。

### 16.2 上传到已有数据集

`POST /api/dataset/upload/init` 和 `POST /api/dataset/upload/folder` 现在支持以下可选字段：

| 字段 | 说明 |
| --- | --- |
| `assetId` | 传入时表示给已有数据集新增版本；不传时创建新数据集资产。 |
| `versionLabel` | 展示用版本标签；旧字段 `version` 继续兼容为别名。 |
| `description` | 当前版本说明。 |
| `changeLog` | 当前版本变更说明。 |
| `parentVersionId` | 来源版本；不传时使用资产 `currentVersionId`。 |

上传完成后：

- 新资产首个版本自动生成 `versionNo=1`，默认标签 `v1`。
- 已有资产新增版本自动生成下一个 `versionNo`，默认标签 `v{versionNo}`。
- 新上传成功的版本默认 `status=READY`，并自动成为该资产的 `currentVersionId`。
- MinIO 路径使用 `users/{userId}/datasets/{assetId}/v{versionNo}/{fileName}`。

### 16.3 当前版本和版本历史

`GET /api/dataset/list` 返回每个数据集资产的当前推荐版本。新增字段包括：

| 字段 | 说明 |
| --- | --- |
| `currentVersionId` | 当前推荐版本 ID。 |
| `currentVersionNo` | 当前推荐版本序号。 |
| `currentVersionLabel` | 当前推荐版本展示标签。 |
| `versionStatus` | 当前推荐版本状态。 |
| `versionDescription` | 当前推荐版本说明。 |

兼容字段 `versionId` 和 `version` 分别映射到当前推荐版本 ID 和展示标签。

`GET /api/dataset-versions?assetId={assetId}` 返回该资产下未删除版本历史，指定 `assetId` 时按 `versionNo` 降序返回。

### 16.4 当前版本切换和状态流转

切换当前推荐版本：

```http
PUT /api/dataset-assets/{assetId}/current-version
Content-Type: application/json

{ "versionId": "dataset-ver-xxx" }
```

只能切换到同一资产下、未删除、`status=READY` 的版本。

更新版本状态：

```http
PATCH /api/dataset-versions/{id}/status
Content-Type: application/json

{ "status": "READY" }
```

状态规则：

- 手工创建版本只允许管理员创建 `DRAFT` 元数据版本，且不能携带 `fileName`、`storagePath`、`sizeBytes`。
- 文件元数据只能由数据集上传流程写入，不能通过数据集版本 CRUD 修改。
- `READY` 版本必须具备 `storagePath`、`fileName`、`sizeBytes`。
- 状态更新接口只允许更新为 `READY`、`DEPRECATED`、`ARCHIVED`，不能把版本改回 `DRAFT`。
- 当前版本不能直接改为 `DEPRECATED` 或 `ARCHIVED`，需先切换 `currentVersionId`。
- 被训练实验引用的版本仍然不能删除。
- 当前版本不能删除。

训练创建和实验新版本创建仍然必须传 `datasetVersionId`，且目标版本必须是 `READY` 并具备存储路径。`DEPRECATED` 版本可保留历史和预览，但不能用于新训练；`DRAFT`、`ARCHIVED` 不允许训练或预览。

## 17. 本次数据集版本管理修复范围

本次修改仅针对数据集上传和版本管理的正确性、幂等性与数据一致性进行修复，不调整现有数据类型体系。

- 数据集上传继续兼容 `CV`、`NLP`、`POINT_CLOUD`；`ROBOT` 仍为预留类型。
- 本次不新增 `VIDEO` 类型，不增加视频上传、转码或预览接口。
- 本次不新增多模态数据表，不改变一个数据集资产对应单一 `type` 的现有模型。
- 现有数据集上传、列表、普通预览、点云预览和训练接口路径保持不变。
- 新资产首个版本由后端生成 `versionNo=1`；已有资产新增版本时按资产维度生成下一个版本序号。
- `parentVersionId` 仅允许用于已有资产，并且必须属于同一个 `assetId`。
- 同一资产下 `versionLabel` 不允许重复，重复请求会在写入 MinIO 对象前被拒绝。
- 重复调用 complete 时返回已经完成的同一版本，不重复创建版本或对象。
- 上传到已有资产时，请求中的 `type`、`cvTaskType`、`annotationFormat` 必须与资产元数据一致。
- 当前版本不能删除；当前版本只能切换到同资产下未删除且状态为 `READY` 的版本。

视频数据集与完整多模态管理属于后续独立改造范围，实施时需要单独设计模态模型、文件元数据、预览链路和训练契约，不能从本次版本管理修复范围推导为已经支持。
