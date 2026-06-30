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

模型和训练模块使用的任务类型 `type`：

| 值 | 说明 |
| --- | --- |
| `CV` | 计算机视觉 |
| `NLP` | 自然语言处理 |
| `POINT_CLOUD` | 点云数据 |
| `ROBOT` | 机器人数据，类型预留 |

数据集模块使用独立的数据集任务类型，额外支持：

| 值 | 说明 |
| --- | --- |
| `MULTIMODAL` | 单个数据集版本内管理图片、文本、点云、音频、视频等多种模态；支持 MANIFEST 或 AUTO_DIRECTORY ZIP 异步导入 |

`MULTIMODAL` 只适用于数据集资产、数据集列表和数据集上传接口。模型上传和训练接口仍不接受该类型。

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
| `DRAFT` | 草稿元数据，不能通过正式版本预览或进入训练；MULTIMODAL 工作区只能使用 workspace 接口维护 |
| `READY` | 可作为当前版本、可预览、可用于创建训练 |
| `DEPRECATED` | 历史版本，不能创建新训练；CV/NLP/POINT_CLOUD 预览允许该状态，MULTIMODAL 样本、文件和 V2 预览只允许 `READY` |
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
| `importJobId` | 多模态数据导入任务 ID |

业务集成时优先引用稳定 ID，不建议长期依赖 `storagePath` 或 MinIO 对象路径。

### 1.5 前端统一接入方式

1. 前端先调用模块一 `POST /api/user/login` 登录，从 `data.token` 取得令牌。
2. 后续模块二请求统一携带 `Authorization: Bearer <token>`。如果使用 Cookie 登录态，跨域请求还需要启用 `credentials`。
3. 普通 JSON 接口先判断 HTTP 状态，再判断响应体 `success`；不能只以 HTTP `200` 作为业务成功。
4. 文件流接口应使用 `blob` 或 `arrayBuffer` 接收。若响应 `Content-Type` 为 `application/json`，说明后端返回了错误对象，不应继续交给预览器解析。
5. 前端保存和传递业务 ID 时要区分资产 ID 与版本 ID。训练、模型代码预览、数据集内容预览和点云预览都使用版本 ID。
6. `previewUrl` 是受鉴权保护的相对 URL。使用 `<img>`、Three.js Loader 等不会自动附加 Axios 拦截器请求头的组件时，应先用带令牌的 `fetch`/请求库取得 `Blob` 或 `ArrayBuffer`，再交给组件解析。
7. 列表接口中的 `page` 和 `current` 都从 `1` 开始；同时传入时 `current` 优先。模型和数据集主列表未传 `pageSize` 时会返回全部数据。
8. zip entry 路径入参可以使用 `/` 或 `\`，后端会统一规范化为 `/`；后端返回的 `path` 固定使用 `/`，作为查询参数时仍需 URL 编码，不要自行拼接。
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
  -> 普通数据集使用返回的 id/versionId
```

- 不传 `assetId` 时创建新数据集资产；传入 `assetId` 时给已有资产创建新版本。
- CV 本地文件夹可使用 `/api/dataset/upload/folder` 一次提交，后端会打包为 zip；大文件仍建议使用分片流程。
- CV/NLP/POINT_CLOUD/ROBOT 旧上传流程完成后，新版本为 `READY`，并自动成为资产的 `currentVersionId`。
- `MULTIMODAL` 必须上传 zip。init 未传 `sampleGrouping` 时默认 `AUTO_DIRECTORY`；高级调用方可显式传 `MANIFEST`。complete 后先返回 `DRAFT` 版本和 `PENDING` ImportJob，后台随后解析 manifest 或按根级样本目录生成内存导入计划。
- 导入成功后 ImportJob 变为 `SUCCESS`、版本变为 `READY`，并按 `versionNo` 条件更新 `currentVersionId`；失败时 ImportJob 变为 `FAILED`，版本保持 `DRAFT`。前端可轮询 `/api/dataset-samples/import/{importJobId}/status`。
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
legacy: 准备 modelVersionId、datasetVersionId、codeVersionId、hyperParams
profile: 准备 baseModelVersionId、datasetVersionId、codeVersionId、trainingProfile、hyperParams
  -> POST /api/task/create 或 POST /api/experiments
  -> GET /api/task/detail 轮询最新状态
  -> 需要保留实验历史时使用 /api/experiments/{experimentId}/versions
```

创建训练后，服务会在数据库事务提交后异步启动训练执行器。不带 `trainingProfile` 的兼容任务走本地训练器；带 `trainingProfile` 的任务走 K8s profile 训练路径，并要求训练代码版本通过准入。当前本地训练实现会读取 YOLO zip 中的图片和 `labels/` 下 `.txt` 标签；类型匹配通过并不代表任意格式都能被当前本地训练器实际解析。

### 1.7 接口速查与前端注意事项

以下表格覆盖当前模块二主要 legacy Controller 接口。V2 用户型门面接口见第 18 章，详细字段仍以各章节为准。

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
| `POST /api/dataset/upload/init` | 创建或恢复数据集上传会话 | 支持 `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 和 `MULTIMODAL + MANIFEST/AUTO_DIRECTORY`；分片大小由文件大小动态计算 |
| `POST /api/dataset/upload/chunk` | 上传数据集分片 | 使用 init 返回的 `chunkSize`；最多 10000 个分片；按 `uploadedPartIndexes` 支持续传 |
| `GET /api/dataset/upload/progress` | 查询上传进度和版本预分配信息 | 完成后可取得 `assetId`、`versionId`、`versionNo`、`versionLabel` |
| `POST /api/dataset/upload/complete` | 合并文件并创建版本 | 普通类型创建 READY；MULTIMODAL 创建 DRAFT、PRIMARY package 和 PENDING ImportJob，并异步启动导入 |
| `GET /api/dataset-samples/import/{importJobId}/status` | 查询多模态导入任务状态 | 通过任务关联的数据集资产校验权限；不返回 MinIO 路径 |
| `GET /api/dataset-versions/{versionId}/samples` | 分页查询多模态样本 | 仅允许查询未删除的 READY 版本；默认每页 20 条，最多 100 条 |
| `GET /api/dataset-samples/{sampleId}` | 查询多模态样本详情 | 返回 sample、data 和 annotations，不返回 MinIO/ZIP 定位字段 |
| `GET /api/dataset-samples/{sampleId}/data` | 查询样本数据项 | 返回安全元数据；链接由调用方按 dataId 组装 |
| `GET /api/dataset-sample-data/{dataId}/preview` | 预览 ZIP 内数据项 | IMAGE/TEXT/POINT_CLOUD/安全文本类 OTHER 使用 D2 全量流；STORED VIDEO 支持单段 HTTP Range |
| `GET /api/dataset-sample-data/{dataId}/download` | 下载 ZIP 内数据项 | 使用 ZIP Entry Index + MinIO range 流式读取，不支持 HTTP Range |
| `GET /api/dataset-annotations/{annotationId}/download` | 下载 ZIP 内 annotation | 只返回文件流，不暴露 ZIP 路径或索引 |
| `POST /api/dataset-versions/{readyVersionId}/draft` | 基于 READY 创建维护工作区 | 物化父版本元数据；ZIP-backed 单模态旧版本会索引父 ZIP，不复制 MinIO ZIP，不改变 `currentVersionId` |
| `POST /api/dataset-versions/{draftVersionId}/packages/init` | 初始化 DRAFT 追加 ZIP 上传 | 支持 MULTIMODAL DRAFT 和 ZIP-backed 单模态 DRAFT；分片仍使用通用 chunk/progress 接口 |
| `POST /api/dataset-versions/{draftVersionId}/packages/complete` | 完成追加 ZIP 上传 | 创建 APPEND package、版本关系和独立 ImportJob；导入成功后 DRAFT 仍保持 DRAFT |
| `GET /api/dataset-versions/{draftVersionId}/workspace/samples` | 查询 DRAFT 工作区样本 | 支持分页及 `includeDeleted`，只允许访问有权限的未删除 DRAFT |
| `GET /api/dataset-samples/{sampleId}/workspace` | 查询 DRAFT 样本详情 | 返回物化后的 data 和 annotations，不返回 package 或 ZIP 定位字段 |
| `GET /api/dataset-samples/{sampleId}/workspace/data` | 查询 DRAFT 样本数据项 | 只返回安全元数据；本接口不开放 DRAFT preview/download |
| `DELETE /api/dataset-samples/{sampleId}/workspace` | 软删除 DRAFT 样本 | 只修改 DRAFT 样本删除标记，不修改父 READY，不物理删除 ZIP |
| `POST /api/dataset-samples/{sampleId}/workspace/restore` | 恢复 DRAFT 样本 | 清除 DRAFT 样本删除标记 |
| `POST /api/dataset-versions/{draftVersionId}/publish` | 发布 DRAFT 为新 READY | 校验导入、package、样本唯一性和版本顺序后更新 `currentVersionId` |
| `POST /api/dataset/upload/folder` | 上传 CV 文件夹 | `files` 与 `paths` 必须一一对应；后端同步打包上传，不适合超大文件夹 |
| `GET /api/dataset/list` | 数据集资产主列表 | 每条记录代表资产并携带当前 READY 版本及最新 DRAFT 的导入状态；预览/训练仍使用 `versionId` |
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
- 类型下拉框应传 `type`，模型接口只支持 `CV`、`NLP`、`POINT_CLOUD` 或 `ROBOT`。
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

数据集分片上传流程与模型上传一致，但数据集分片大小会根据文件大小动态计算：

```text
chunkSize = max(5MB, ceil(fileSize / 10000))
chunkSize 再向上取整到 1MB
totalChunks = ceil(fileSize / chunkSize)
```

`totalChunks` 不会超过 `10000`。前端必须使用 init 响应中的 `chunkSize` 和 `totalChunks`，不能固定按 5MB 切分。

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
| `type` | string | 是 | `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 或 `MULTIMODAL` |
| `cvTaskType` | string | 否 | CV 子任务；非 CV 会被置为 `null` |
| `annotationFormat` | string | 否 | CV 标注格式；非 CV 会被置为 `null` |
| `remark` | string | 否 | 备注 |
| `sampleGrouping` | string | 否 | `MULTIMODAL` 默认 `AUTO_DIRECTORY`，可显式传 `MANIFEST`；其他类型禁止传 |
| `manifestPath` | string | 否 | 仅 `MANIFEST` 允许；未传时默认为 `manifest.json`。可使用 `/` 或 `\`，后端统一规范化为 `/`；`AUTO_DIRECTORY` 不允许传 |

文件类型规则：

| 类型 | 规则 |
| --- | --- |
| `CV` | 分片上传只支持 `.zip`；zip 内必须至少包含 `.jpg`、`.jpeg`、`.png`、`.bmp`、`.gif`、`.webp`、`.tif` 或 `.tiff` 图片 |
| `NLP` | 支持 `.txt`、`.json`、`.jsonl`、`.csv`、`.xlsx`、`.xls`、`.pdf`、`.docx`、`.xml`，或只包含这些文件的 `.zip` |
| `POINT_CLOUD` | 支持单文件 `.ply`、`.pcd`，或 `.zip`；zip 内至少包含一个 `.ply` 或 `.pcd`，且仅允许 `.ply`、`.pcd`、`.txt`、`.json`、`.yaml`、`.yml` |
| `ROBOT` | 支持单文件 `.xml`、`.yaml`、`.yml`，或 `.zip`；zip 内仅允许 `.xml`、`.yaml`、`.yml`、`.json`、`.txt` |
| `MULTIMODAL` | 只支持 `.zip`；未传 `sampleGrouping` 时默认 `AUTO_DIRECTORY`，显式 `MANIFEST` 时可传 `manifestPath`；complete 后由异步 ImportJob 解析 ZIP 索引并生成导入计划 |

`manifestPath` 规则：

- 长度不能超过 `255`。
- 不能是 `/` 开头的绝对路径或 Windows 盘符路径。
- 可以使用 `/` 或 `\` 作为分隔符，后端统一规范化为 `/`。
- 规范化后不能包含 `..` 路径段或空字节。
- 只有 `sampleGrouping=MANIFEST` 时允许传入。

manifest JSON 内的 `data[].path`、`annotations[].path` 和 `annotations[].ref_data_path` 使用同一套 ZIP 路径规则：接受 `/` 或 `\`，统一规范化为 `/`，继续拒绝空路径、绝对路径、Windows 盘符、空字节和 `..`。

CV zip 中的非图片文件会按照 `annotationFormat` 过滤：

| `annotationFormat` | 允许的标注文件 | 是否至少需要一个标注文件 |
| --- | --- | --- |
| `NONE`、`FOLDER_CLASSIFICATION`、`MASK` | 不允许非图片文件 | 否 |
| `CSV` | `.csv` | 是 |
| `YOLO` | `.txt`、`.yaml`、`.yml` | 是 |
| `COCO`、`LABELME` | `.json` | 是 |
| `VOC` | `.xml` | 是 |
| `OTHER` | `.txt`、`.json`、`.xml`、`.csv`、`.yaml`、`.yml` | 否 |

响应 `data` 字段与模型上传进度类似，额外包含 `cvTaskType`、`annotationFormat`。其中 `chunkSize` 是本次会话实际使用的动态分片大小。

多模态初始化示例：

```json
{
  "datasetName": "autonomous-driving-scenes",
  "fileName": "scene-bundle.zip",
  "fileSize": 53687091200,
  "fileFingerprint": "sha256-demo",
  "type": "MULTIMODAL",
  "sampleGrouping": "MANIFEST",
  "manifestPath": "metadata/manifest.json",
  "versionLabel": "v1"
}
```

AUTO_DIRECTORY 初始化时不传 `manifestPath`：

```json
{
  "datasetName": "autonomous-driving-scenes",
  "fileName": "scene-bundle.zip",
  "fileSize": 53687091200,
  "type": "MULTIMODAL",
  "sampleGrouping": "AUTO_DIRECTORY",
  "versionLabel": "v1"
}
```

AUTO_DIRECTORY ZIP 根目录必须直接是样本目录，不会自动剥离 `v1/`、`append/` 等 wrapper：

```text
scene_001/
  image/front.jpg
  point_cloud/lidar.pcd
  annotations/front.jpg.json
scene_002/
  image/front.png
```

确定性规则：

- 根级目录名就是 `external_id`；根级普通文件直接失败。样本按 `external_id` 排序生成 `sampleIndex`。
- 每个样本至少包含一个 Data；各样本可使用不同模态子集，只有图片和点云也合法。
- `annotations/` 下文件视为 Annotation，其余文件视为 Data。
- Data 扩展名白名单：图片 `jpg/jpeg/png/bmp/gif/webp/tif/tiff`，点云 `pcd/ply`，视频 `mp4/webm/mov/avi/mkv`，音频 `wav/mp3/flac`，文本 `txt/md/csv/jsonl`，其他 `bin/log/npy/npz/pkl`。未知或无扩展名文件失败。
- Annotation 只允许 `json/txt/xml/csv/yaml/yml`。先按去掉 annotation 扩展名后的完整 Data 文件名匹配，再按唯一文件名 stem 匹配；零匹配或多匹配都失败，不猜测。
- AUTO 生成的 `sensor`、`channel` 为 `null`，tags/metadata 为空。需要自定义这些字段时使用 MANIFEST。
- 生成结果只存在 ImportJob 内存中；后端不修改用户 ZIP，也不向 MinIO 写入 `manifest.json`。
- MANIFEST 和 AUTO_DIRECTORY 每个导入计划最多包含 10000 个样本；每个样本最多 100 个 Data、100 个 Annotation；全部 Data 与 Annotation 引用合计最多 100000 个。
- 数据集 ZIP 最多 100000 个 entry，声明的解压后总大小最多 50GB；ZIP entry 路径同样会把 `\` 规范化为 `/`，规范化后重复、绝对路径、盘符、空字节或 `..` 会失败。

50GB 文件的典型响应会返回：

```json
{
  "chunkSize": 6291456,
  "totalChunks": 8534
}
```

版本管理补充：

- `assetId`：初始化上传时可选。为空表示创建新的数据集资产；非空表示给已有数据集资产新增版本。
- `versionNo`：后端生成的真实版本序号，同一 `assetId` 下从 `1` 递增。
- `versionLabel`：展示标签；旧字段 `version` 作为兼容别名。客户端不应依赖 `version` 判断版本顺序。
- `description`：当前版本说明。
- `changeLog`：相对父版本的变更说明。
- `parentVersionId`：父版本 ID；新增到已有资产且不传时默认使用该资产的当前版本。父版本必须属于同一资产、未删除且状态为 `READY`。
- CV/NLP/POINT_CLOUD/ROBOT 上传完成后新版本为 `READY`，并自动成为 `dataset_asset.currentVersionId`。
- MULTIMODAL 上传完成后版本保持 `DRAFT`，不会修改 `dataset_asset.currentVersionId`，并创建状态为 `PENDING` 的 ImportJob。
- 训练、预览和文件接口继续使用返回的 `id` / `versionId` 作为 `datasetVersionId`，不要使用 `assetId` 或 `versionLabel` 代替。
- 非 MULTIMODAL zip complete 仍执行对应类型的同步格式校验。MULTIMODAL complete 不读取或解压整个 zip，也不执行单模态文件白名单；manifest 和 ZIP 内容校验由异步 ImportJob 使用 range 读取完成。
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

规则：

- `partIndex` 从 `0` 开始，必须小于 init 返回的 `totalChunks`。
- 非最后一个分片的大小必须严格等于 init 返回的 `chunkSize`。
- 最后一个分片可以小于 `chunkSize`。

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

普通 CV/NLP/POINT_CLOUD/ROBOT 响应 `data` 示例：

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
  "uploadStatus": "COMPLETED",
  "datasetVersionId": "dataset-ver-9f1a",
  "versionStatus": "READY",
  "importJobId": null,
  "importStatus": null,
  "ownerUserId": 3,
  "createdAt": "2026-05-16T10:00:00Z",
  "updatedAt": "2026-05-16T10:00:10Z"
}
```

MULTIMODAL + MANIFEST/AUTO_DIRECTORY 响应示例：

```json
{
  "uploadId": "dataset-upload-1710000000000-xyz",
  "id": "dataset-ver-draft",
  "datasetVersionId": "dataset-ver-draft",
  "assetId": "dataset-asset-mm",
  "type": "MULTIMODAL",
  "fileName": "scene-bundle.zip",
  "status": "COMPLETED",
  "uploadStatus": "COMPLETED",
  "versionStatus": "DRAFT",
  "importJobId": "ijob-abc",
  "importStatus": "PENDING"
}
```

返回的 `id` 和 `datasetVersionId` 都是数据集版本 ID。

前端注意事项：

- 响应中的 `status` / `uploadStatus=COMPLETED` 是上传会话状态，不能当作数据集版本状态。
- 普通类型的 `versionStatus=READY`；MULTIMODAL 的 `versionStatus=DRAFT`。
- MULTIMODAL complete 只执行 MinIO compose 和 stat，不调用现有 zip 全量格式校验。
- MULTIMODAL complete 会为当前 ZIP 创建一个物理 `dataset_package`，并以 `PRIMARY`、`packageOrder=0` 关联到新版本；`ImportJob.packageId` 指向该 package。
- 导入生成的 Sample、Data 和 Annotation 会记录来源 package。初始导入成功后版本变为 READY，`DatasetVersion.storagePath` 仍保留，兼容没有 packageId 的旧数据。
- MULTIMODAL complete 失败时会清理目标对象和本次创建的 DRAFT；若本次创建了空资产也会清理，并把会话恢复为 `UPLOADING`。
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

### 6.6 查询多模态导入任务状态

```http
GET /api/dataset-samples/import/{importJobId}/status
```

路径参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `importJobId` | string | 是 | MULTIMODAL complete 返回的导入任务 ID |

响应 `data`：

| 字段 | 说明 |
| --- | --- |
| `importJobId` | 导入任务 ID |
| `datasetVersionId` | 对应的 DRAFT 数据集版本 ID |
| `status` | `PENDING`、`RUNNING`、`SUCCESS` 或 `FAILED` |
| `progress` | 进度，当前新任务初始化为 `0` |
| `totalSamples` | 导入计划样本总数；任务成功后写入 |
| `importedSamples` | 已导入样本数；成功时等于 `totalSamples` |
| `errorCode` | 结构化错误码；成功或尚未失败时为 `null` |
| `errorMessage` | 全局失败原因 |
| `errorDetailsJson` | 结构化错误详情的 JSON 文本；没有详情时为 `null` |
| `createdAt` | 任务创建时间 |
| `startedAt` | 开始执行时间 |
| `finishedAt` | 完成时间 |

示例：

```json
{
  "success": true,
  "data": {
    "importJobId": "ijob-abc",
    "datasetVersionId": "dataset-ver-draft",
    "status": "PENDING",
    "progress": 0,
    "totalSamples": null,
    "importedSamples": 0,
    "errorCode": null,
    "errorMessage": null,
    "errorDetailsJson": null,
    "createdAt": "2026-06-10T10:00:00Z",
    "startedAt": null,
    "finishedAt": null
  },
  "errorMessage": null
}
```

权限规则：

- 后端按 `ImportJob -> DatasetVersion -> DatasetAsset` 回溯资源归属。
- 普通用户只能查询自己数据集资产的任务；管理员可查询全部。
- 接口不返回 `storagePath`、bucket 或其他 MinIO 对象路径。

#### FULL 重试失败导入

```http
POST /api/dataset-samples/import/{importJobId}/retry?mode=FULL
```

约束：

- 只支持 `mode=FULL`，未传时按 `FULL` 处理；`PARTIAL`、`INCREMENTAL` 和未知值会被拒绝。
- 只允许重试 `status=FAILED` 的 ImportJob。
- 对应 DatasetVersion 必须仍为 `DRAFT`。
- 若该 ImportJob 对应的版本或 package 已经存在导入样本，后端拒绝重试；当前不做半导入样本清理。
- 重试会清空 `errorCode`、`errorMessage`、`errorDetailsJson`，重置 `progress=0`、`importedSamples=0`，把状态置为 `PENDING`，并通过现有 ImportJob launcher 重新调度。

当前实现：

- complete 创建 `PENDING` ImportJob，并通过 Spring 管理的任务线程池异步执行。
- ImportJob 状态会进入 `RUNNING`，成功后为 `SUCCESS`，异常时为 `FAILED`。
- 失败 ImportJob 支持受控 `FULL` 重试，不引入 `PARTIAL` 状态。
- MANIFEST 会解析用户提供的 manifest；AUTO_DIRECTORY 会根据根级样本目录生成内存导入计划。两种模式最终都写入 DatasetSample、DatasetSampleData 和 DatasetAnnotation。
- 运行中的任务每 30 秒更新 heartbeat；超过 30 分钟无 heartbeat 的任务会重置为 `PENDING` 并重新调度。

### 6.7 查询多模态样本

以下接口只允许查询 `status=READY` 且 `deleted=false` 的 DatasetVersion。DRAFT 版本即使已经存在部分样本记录也不可查询。

#### 分页查询版本样本

```http
GET /api/dataset-versions/{versionId}/samples?page=1&pageSize=20
```

- `page` 默认 `1`，小于等于 `0` 时按 `1` 处理。
- `pageSize` 默认 `20`，最大 `100`。
- 按 `sampleIndex ASC, createdAt ASC, id ASC` 稳定排序。

响应 `data`：

```json
{
  "data": [{
    "sampleId": "sample-001",
    "datasetVersionId": "dataset-ver-ready",
    "externalId": "scene-001",
    "sampleIndex": 0,
    "tags": { "weather": "sunny" },
    "metadata": { "split": "train" },
    "createdAt": "2026-06-11T08:00:00Z"
  }],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

#### 查询样本详情

```http
GET /api/dataset-samples/{sampleId}
```

详情包含 Sample 基础字段，以及 `data` 和 `annotations`：

```json
{
  "sampleId": "sample-001",
  "datasetVersionId": "dataset-ver-ready",
  "externalId": "scene-001",
  "sampleIndex": 0,
  "tags": {},
  "metadata": {},
  "createdAt": "2026-06-11T08:00:00Z",
  "data": [{
    "sampleDataId": "data-001",
    "dataType": "VIDEO",
    "sensor": "front",
    "channel": "rgb",
    "seq": 0,
    "format": "mp4",
    "fileName": "front.mp4",
    "sizeBytes": 1048576,
    "checksum": null,
    "contentType": "video/mp4",
    "metadata": { "codec": "h264" },
    "createdAt": "2026-06-11T08:00:01Z"
  }],
  "annotations": [{
    "annotationId": "annotation-001",
    "sampleDataId": "data-001",
    "annotationType": "TRACK",
    "format": "json",
    "fileName": "track.json",
    "sizeBytes": 4096,
    "checksum": null,
    "contentType": "application/json",
    "metadata": {},
    "createdAt": "2026-06-11T08:00:02Z"
  }]
}
```

#### 查询样本 Data 列表

```http
GET /api/dataset-samples/{sampleId}/data
```

返回字段与样本详情中的 `data` 一致。

权限和安全规则：

- 所有查询都按 `Sample -> DatasetVersion -> DatasetAsset` 回溯资源归属。
- 普通用户只能查询自己的数据集样本，管理员可按现有 `AuthContext` 规则跨用户查询。
- 不存在、无权限、版本已删除或版本不是 READY 时统一返回失败，不暴露资源真实存在性。
- 响应不包含 `storagePath`、bucket、`originalPath`、ZIP offset、压缩信息、CRC 或 MinIO objectName。
- D1 DTO 仍不返回 `previewUrl`、`downloadUrl`；调用方可使用 `sampleDataId` 或 `annotationId` 调用下述 D2 文件接口。

### 6.8 多模态样本 preview/download

以下接口仅适用于已成功导入、`status=READY` 且 `deleted=false` 的 DatasetVersion：

```http
GET /api/dataset-sample-data/{dataId}/preview
GET /api/dataset-sample-data/{dataId}/download
GET /api/dataset-annotations/{annotationId}/download
```

读取流程：

1. 根据 dataId 或 annotationId 读取已落库的 `zipDataOffset`、`compressedSize`、`uncompressedSize` 和 `compressionMethod`。
2. preview 通过 DatasetSampleData -> DatasetSample -> DatasetVersion -> DatasetAsset 回溯；download 通过数据项关联的 DatasetVersion -> DatasetAsset 回溯，完成状态、删除标记和所有权校验。
3. Data/Annotation 有 `packageId` 时从对应 `dataset_package.storagePath` 定位 ZIP；旧数据 `packageId` 为空时回退到 `DatasetVersion.storagePath`。
4. 使用 MinIO range request 只读取目标 ZIP entry 的压缩字节。
5. `STORED` 直接返回，`DEFLATED` 使用 raw deflate 流式解压。
6. 不支持其他压缩算法，也不回退到从 ZIP 开头顺序扫描。

preview 支持：

- `IMAGE`
- `TEXT`
- `POINT_CLOUD`
- `OTHER` 中 contentType 为 `text/plain`、`text/csv`、`application/json`、`application/xml` 或 `text/xml`

普通 preview 限制：

- `AUDIO` 返回 `415`。
- 解压后大小超过 `100MB` 返回 `413`。
- 缺少 ZIP Entry Index 或无法确定 preview 大小时返回 `422`。

VIDEO preview：

- 仅 `dataType=VIDEO` 且 `compressionMethod=STORED` 支持在线播放。
- `compressedSize` 必须等于 `uncompressedSize`，且 `zipDataOffset`、`compressedSize`、`uncompressedSize` 均必须有效；否则返回 `422`。
- `DEFLATED` 或其他压缩方式返回 `415`，但 download 仍沿用 D2 解压下载逻辑。
- 不带 `Range` 时流式返回完整视频 `200 OK`。
- 支持单段 `bytes=start-end`、`bytes=start-` 和 `bytes=-suffixLength`。
- 多段、格式非法、起始位置越界或显式结束位置越界返回 `416`。
- Range 读取的 MinIO 偏移为 `zipDataOffset + rangeStart`，长度为 `rangeEnd - rangeStart + 1`，不会把视频整体载入内存。
- VIDEO 的数据库 contentType 为空时回退为 `video/mp4`。

响应头：

- preview 使用数据库 `contentType` 和 `Content-Disposition: inline`。
- download 使用数据库 `contentType`；缺失或非法时回退 `application/octet-stream`，并使用安全处理后的 attachment 文件名。
- 普通非 VIDEO preview 和全部 download 保持完整文件 `200 OK`，不处理请求中的 Range。
- VIDEO STORED 全量响应返回 `200`、`Accept-Ranges: bytes` 和完整 `Content-Length`。
- VIDEO STORED 单段 Range 响应返回 `206`、`Accept-Ranges: bytes`、`Content-Range: bytes start-end/total` 和区间 `Content-Length`。
- VIDEO Range 返回 `416` 时包含 `Content-Range: bytes */total`。

权限和安全：

- data 和 annotation 都会回溯 `DatasetVersion -> DatasetAsset`。
- 普通用户只能访问自己的数据集文件，管理员沿用现有 AuthContext 规则。
- 不存在、无权限、DRAFT、FAILED 导入版本或已删除版本统一返回 `404`，不暴露资源真实存在性。
- 响应和错误信息不包含 `storagePath`、bucket、`originalPath`、ZIP offset、CRC 或 MinIO objectName。
- 本阶段不实现 thumbnail、转码、抽帧或视频播放。

## 7. 数据集查询接口

基础路径：`/api/dataset`

### 7.1 查询数据集列表

```http
GET /api/dataset/list
```

查询参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 否 | `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 或 `MULTIMODAL` |
| `keyword` | string | 否 | 按数据集名称、版本、数据集备注、版本备注、版本说明、文件名模糊搜索 |
| `page` | integer | 否 | 页码 |
| `current` | integer | 否 | 页码；优先级高于 `page` |
| `pageSize` | integer | 否 | 每页数量；不传则返回全部，传入时最大 `200` |

前端查询对接说明：

- 数据集名称输入框应传 `keyword`，后端会按数据集名称、版本、数据集备注、版本备注、版本说明、文件名做不区分大小写的模糊搜索。
- 类型下拉框应传 `type`，取值为 `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 或 `MULTIMODAL`。
- 如果前端表单字段名是 `datasetName` 或 `name`，提交请求前需要映射为 `keyword`。
- 示例：`GET /api/dataset/list?keyword=casting&type=CV&page=1&pageSize=10`。

列表项字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 数据集资产 ID |
| `assetId` | 数据集资产 ID |
| `name` | 数据集名称 |
| `type` | `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 或 `MULTIMODAL` |
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
| `fileCount` | 当前推荐版本文件数；兼容前端旧列名 |
| `currentVersionFileCount` | 当前推荐版本文件数 |
| `versionCount` | 当前资产下未删除版本数量 |
| `uploadTime` | 当前推荐版本上传时间 |
| `createdAt` | 资产创建时间 |
| `updatedAt` | 资产更新时间 |
| `latestDraftVersionId` | 该资产下 `versionNo` 最大的 DRAFT 版本 ID；没有时为 `null` |
| `importJobId` | 最新 DRAFT 对应的导入任务 ID；没有时为 `null` |
| `importStatus` | 最新 DRAFT 的 `PENDING`、`RUNNING` 或 `FAILED` 状态；成功后版本转为 READY，不再属于最新 DRAFT |
| `importProgress` | 最新 DRAFT 导入进度 |
| `importErrorMessage` | 最新 DRAFT 导入失败原因；非失败状态通常为 `null` |

训练创建时应使用 `versionId` 作为 `datasetVersionId`。

版本字段：

- `versionId` / `currentVersionId`：当前推荐版本 ID。
- `currentVersionNo`：当前推荐版本的后端序号。
- `currentVersionLabel` / `version`：当前推荐版本展示标签。
- `versionStatus`：当前推荐版本状态。
- `versionDescription`：当前推荐版本说明。
- `latestDraftVersionId` 和 `import*` 字段只描述最新 DRAFT，不改变 `versionId` / `currentVersionId` 的 READY 当前版本语义。
- 列表优先使用 `dataset_asset.current_version_id`；如果为空或不可用，则回退到该资产下 `status=READY` 且 `versionNo` 最大的版本。
- `fileCount` 与 `currentVersionFileCount` 当前都表示当前推荐 READY 版本文件数；没有当前推荐版本或计数不可用时为 `null`。
- `versionCount` 表示当前资产下未删除版本数量。
- 文件数优先读取 `dataset_version.file_count`；旧数据为空时懒计算并回写，计算失败返回 `null`，不阻断列表。
- 已物化为 Sample/Data/Annotation 元数据的版本按 Sample Data 与 Annotation 条目数相加；传统普通 ZIP 数据集按当前版本源 ZIP 的非目录 entry 计数；非压缩单文件版本计为 1。
- 列表先在数据库按资产分页，再只补全当前页资产的版本、导入任务和文件数；V1 未传 `pageSize` 时仍按兼容逻辑返回全部。

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
| `type` | string | 是 | `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 或 `MULTIMODAL` |
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
| `type` | string | 是 | `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 或 `MULTIMODAL` |
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

### 9.2 基于 READY 创建 DRAFT 工作区

```http
POST /api/dataset-versions/{readyVersionId}/draft
```

该接口为已有数据集创建后续维护工作区。`readyVersionId` 必须属于调用方可访问的数据集资产，且版本必须未删除并处于 `READY`。同一资产已有未删除 `DRAFT` 时拒绝创建，并返回已有 DRAFT 的版本 ID。

创建结果：

- 新版本分配新的 `versionNo` 和默认 `versionLabel=v{versionNo}`。
- `parentVersionId` 指向请求中的 READY 版本。
- 新版本状态固定为 `DRAFT`，`publishedAt` 为空。
- 若父 READY 已有 Sample/Data/Annotation 元数据，物化复制其中未删除的 DatasetSample、DatasetSampleData 和 DatasetAnnotation，复制记录使用新 ID，Annotation 的 sampleDataId 映射到 DRAFT 内的新 Data。
- 复制父版本的 `dataset_version_package` 关系，复用同一批 `dataset_package` 和 ZIP 对象；不复制 MinIO ZIP。
- ZIP-backed `CV`、`NLP`、`POINT_CLOUD`、`ROBOT` 旧版本若没有 package 元数据，创建 DRAFT 时会把父 ZIP 登记为 `PRIMARY` package，并按 ZIP 非目录 entry 生成一文件一样本的 Sample/Data 元数据。
- 非 ZIP 单模态旧版本不能创建维护工作区；需要先重新上传为 ZIP 数据集。
- DRAFT 的样本元数据是独立数据库记录，后续软删除、恢复或追加不会修改父 READY。
- 不创建 ImportJob，不读取 manifest，不执行导入。
- 不更新 DatasetAsset.currentVersionId；当前版本仍保持原 READY 版本。
- 普通样本查询仍只接受 READY；DRAFT 必须使用 workspace 专用查询接口。

响应示例：

```json
{
  "success": true,
  "data": {
    "draftVersionId": "dataset-ver-workspace",
    "parentVersionId": "dataset-ver-ready",
    "datasetAssetId": "dataset-asset-001",
    "versionNo": 3,
    "status": "DRAFT",
    "currentVersionId": "dataset-ver-ready",
    "message": "workspace draft created"
  },
  "errorMessage": null
}
```

响应不返回 `storagePath`、MinIO objectName 或 bucket。同一资产只允许一个未删除 DRAFT。

### 9.3 追加 ZIP 到 DRAFT

初始化上传：

```http
POST /api/dataset-versions/{draftVersionId}/packages/init
Content-Type: application/json
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fileName` | string | 是 | 必须是 `.zip` |
| `fileSize` | number | 是 | ZIP 字节数，必须大于 0 |
| `fileFingerprint` | string | 否 | 客户端文件指纹 |
| `sampleGrouping` | string | 否 | 仅 `MULTIMODAL` 使用；未传默认 `AUTO_DIRECTORY`，可显式传 `MANIFEST`；单模态禁止传 |
| `manifestPath` | string | 否 | 仅 `MULTIMODAL + MANIFEST` 允许，未传时默认 `manifest.json`；可使用 `/` 或 `\`，后端统一规范化为 `/`；`AUTO_DIRECTORY` 和单模态都禁止传 |

init 返回通用上传进度结构。后续分片继续调用：

```http
POST /api/dataset/upload/chunk
GET /api/dataset/upload/progress?uploadId={uploadId}
```

完成上传：

```http
POST /api/dataset-versions/{draftVersionId}/packages/complete
Content-Type: application/json

{ "uploadId": "dataset-upload-..." }
```

要求与结果：

- 版本必须是调用方有权限访问的、未删除的 DRAFT；支持 `MULTIMODAL` 以及 ZIP-backed `CV`、`NLP`、`POINT_CLOUD`、`ROBOT`。
- complete 创建新的 `dataset_package`、`APPEND` 版本关系和独立 ImportJob。
- `MULTIMODAL` APPEND 继续按 `MANIFEST` 或 `AUTO_DIRECTORY` 生成导入计划。
- 单模态 APPEND 只接受 ZIP，禁止 `sampleGrouping` 和 `manifestPath`；complete 会执行对应任务类型的 ZIP 安全与文件白名单校验，ImportJob 再按 ZIP entry 生成一文件一样本的 Sample/Data。
- APPEND 导入只新增 Sample/Data/Annotation，来源字段指向新 package；不会修改继承样本。
- APPEND 导入计划的未删除 `externalId` 或 `sampleIndex` 与当前 DRAFT 冲突时导入失败，不做跨包合并；AUTO_DIRECTORY 同样适用。
- 导入成功后 package 状态变为 READY，但 DatasetVersion 仍保持 DRAFT，`currentVersionId` 不变。
- complete 响应包含 `packageId`、`packageRole=APPEND`、`packageOrder`、`importJobId` 和状态；这些字段只描述导入结果，不进入样本查询 DTO。

### 9.4 查询 DRAFT 工作区样本

```http
GET /api/dataset-versions/{draftVersionId}/workspace/samples?page=1&pageSize=20&includeDeleted=false
GET /api/dataset-samples/{sampleId}/workspace
GET /api/dataset-samples/{sampleId}/workspace/data
```

- 只允许查询 `status=DRAFT`、`deleted=false` 且调用方有权限的数据集版本。
- 列表默认不返回软删除样本；`includeDeleted=true` 可用于工作区维护页展示已删除项。
- `page` 默认 1，`pageSize` 默认 20、最大 100，按 `sampleIndex ASC, createdAt ASC, id ASC` 稳定排序。
- 数据来自 DRAFT 已物化的独立记录，不沿 `parentVersionId` 动态合并。
- detail 返回 data 和 annotations；响应不包含 packageId、storagePath、bucket、originalPath、ZIP offset、CRC 或 MinIO objectName。
- DRAFT 文件 preview/download 仍不开放；发布为 READY 后使用普通文件接口。

### 9.5 删除与恢复 DRAFT 样本

```http
DELETE /api/dataset-samples/{sampleId}/workspace
POST /api/dataset-samples/{sampleId}/workspace/restore
```

- 两个接口都只接受调用方有权限的 DRAFT 样本。
- 删除是软删除，只设置样本的 `deleted/deletedAt`；不删除 Data、Annotation、package 或 MinIO ZIP。
- 恢复会清除删除标记。
- 操作只影响 DRAFT 的物化样本，不影响父 READY。

### 9.6 发布 DRAFT 为新 READY

```http
POST /api/dataset-versions/{draftVersionId}/publish
```

发布前校验：

- DRAFT 必须未删除、属于调用方可访问的数据集资产，且 `versionNo` 高于当前 READY。
- 父版本和当前版本必须是同资产的有效 READY。
- DRAFT 下所有 ImportJob 必须为 SUCCESS。
- 必须存在且仅存在一个顺序为 0 的 PRIMARY package；后续关系必须为连续有序的 APPEND package。
- 所有关联 package 必须未删除、状态为 READY、有存储路径并属于同一资产。
- Sample/Data/Annotation 的 package 引用必须完整且属于该版本关联的 package。
- 至少存在一个未删除样本，未删除样本的 `externalId` 和 `sampleIndex` 不得重复。

发布在同一事务内把 DRAFT 状态改为 READY、设置 `publishedAt` 并更新 `DatasetAsset.currentVersionId`。父 READY、package、MinIO ZIP 和 ImportJob 均不会被复制或修改；软删除样本保留在数据库中，但普通 READY 查询和文件访问不会返回它。发布后 workspace 查询拒绝该版本，普通 READY 查询及 preview/download/VIDEO Range 开始生效。

### 9.7 package 模型

- `dataset_package` 表示一个物理 ZIP，包括归属资产、对象路径、文件信息、manifest 路径、状态和软删除信息。
- `dataset_version_package` 表示某个版本使用哪些物理包，`PRIMARY` 是初始包，`APPEND` 是后续追加包，`packageOrder` 定义稳定顺序。
- READY 创建 DRAFT 时优先复制版本与 package 的关系，复用物理包；ZIP-backed 单模态旧版本没有 package 关系时会补建 PRIMARY package 关系；追加上传再为 DRAFT 增加新的 APPEND package。
- Sample 记录 `createdByPackageId`，Data/Annotation 记录 `packageId`，文件服务据此解析实际 ZIP。
- 旧数据没有 packageId 时继续使用 `DatasetVersion.storagePath`，因此原有已导入版本仍可读取。

### 9.8 查询数据集版本详情

```http
GET /api/dataset-versions/{id}
```

### 9.9 查询数据集版本列表

```http
GET /api/dataset-versions?assetId={assetId}
```

`assetId` 可选。不传时普通用户返回自己可见数据集资产下的全部未删除版本，管理员返回全部未删除版本；此模式没有显式排序和分页。

传 `assetId` 时按 `versionNo` 倒序返回完整版本历史。返回项包含 `versionNo`、`versionLabel`、`status`、`description`、`changeLog`、`parentVersionId`、`fileFingerprint`、`publishedAt` 等字段。

### 9.10 更新数据集版本

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

`assetId` 对普通用户和管理员都不可修改。数据集版本还关联当前版本指针、package 资产归属和存储路径，不能通过通用版本更新接口迁移到其他资产；需要在目标资产下创建新版本时应使用上传或专用版本创建流程。存储元数据对所有角色都不能通过该接口修改。

`remark`、`description`、`changeLog` 会直接使用请求值覆盖，省略时会被更新为 `null`；编辑页应先读取详情并提交完整可编辑字段。

### 9.11 更新数据集版本状态

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
- 工作区不能通过该通用状态接口发布；必须调用 `POST /api/dataset-versions/{draftVersionId}/publish`，由专用服务执行完整性校验和 `currentVersionId` 更新。
- 跨域部署需要注意当前 CORS 未允许 `PATCH`，建议经同源 Nginx 代理调用。

### 9.12 删除数据集版本

```http
DELETE /api/dataset-versions/{id}
```

如果数据集版本被训练实验引用，删除会失败。当前版本不能删除。删除成功后会软删除版本，并将对象加入 MinIO 删除任务。

## 10. 训练任务接口

基础路径：`/api/task`

`/api/task` 是当前前端兼容路径，操作训练实验的最新版本。

训练配置页使用以下训练代码资产接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/code/upload` | 上传训练代码 ZIP，生成 `codeAssetId` 和 `codeVersionId` |
| `GET` | `/api/code/version/list` | 查询当前用户可用于训练的 `READY` + `APPROVED` 代码版本 |
| `POST` | `/api/code/version/{codeVersionId}/approve` | 手工批准代码版本 |
| `GET` | `/api/code/version/{codeVersionId}/training-check?trainingProfile=...` | 按训练方案做代码包结构准入检查；通过后自动置为 `APPROVED` |

`/api/code/upload` 使用 `multipart/form-data`，字段为 `file`、`codeName`、`version`、`trainingProfile`、`remark`。代码包只支持 `.zip`，包内允许 `.py`、`.json`、`.yaml`、`.yml`、`.txt`、`.md`、`.jsonl`，禁止 `.sh`、`.bash`、`.exe`、`.bat`、`.cmd`、`.dll`、`.so`、`.jar`，并会检查 zip slip 路径、条目数和解压后体积。准入通过只代表结构、固定入口和 profile 元数据检查通过，不代表完成代码安全审计。

当前唯一训练方案为 `image_text_consistency_fusion_logreg`（展示名：图文一致性基线训练），要求代码包包含固定入口 `scripts/training/train_fusion_baseline.py`，并要求训练数据集类型为 `NLP`。

### 10.1 创建训练任务

```http
POST /api/task/create
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 否 | 任务名称；不传时使用实验 ID |
| `modelVersionId` | string | 条件 | 兼容模型版本 ID；未传 `baseModelVersionId` 时作为基础模型权重版本使用 |
| `baseModelVersionId` | string | 条件 | 基础模型权重版本 ID；带 `trainingProfile` 时必填，可与 `modelVersionId` 二选一，二者同时传入时必须一致 |
| `datasetVersionId` | string | 是 | 数据集版本 ID |
| `codeVersionId` | string | 是 | 训练代码版本 ID |
| `trainingProfile` | string | 否 | 训练方案 ID；不传走 legacy 本地训练路径，传入时进入 profile/K8s 路径 |
| `hyperParams` | object/string | 条件 | 超参数 JSON；也可使用 `params`。legacy 路径必填，profile 路径不传时按 `{}` 记录 |
| `params` | object/string | 否 | `hyperParams` 的兼容字段 |
| `remark` | string | 否 | 备注 |

后端会校验数据集版本是否存在且当前用户可访问，数据集版本必须为 `READY` 且 `storagePath` 非空。不带 `trainingProfile` 的 legacy 路径会校验模型版本存在、模型类型与数据集类型一致；例如 `POINT_CLOUD` 模型只能匹配 `POINT_CLOUD` 数据集，`CV`、`NLP`、`POINT_CLOUD` 之间错配会被拒绝。带 `trainingProfile` 的 profile 路径会额外校验基础模型权重版本存在且有 `storagePath`、代码版本存在且为 `READY` + `APPROVED`、代码资产 `trainingProfile` 与请求一致，并校验数据集类型符合该 profile 要求。

当前代码的额外行为：

- 不带 `trainingProfile` 的 legacy 路径中，`codeVersionId` 仍只校验非空；带 `trainingProfile` 的 profile 路径中，`codeVersionId` 必须指向已准入的代码版本。
- 创建事务提交后会自动启动 `TrainingExecutorRouter`。legacy 任务走 `LocalTrainingRunnerService`；profile 任务要求 K8s 环境可用，并提交 K8s Job。
- 当前本地训练器实际只解析 zip 中的图片和路径包含 `labels/` 的 YOLO `.txt` 标签。NLP、POINT_CLOUD 或其他 CV 格式即使通过类型匹配，也可能在异步训练阶段进入 `failed`。
- `MULTIMODAL` 当前不属于模型或训练任务类型，不能用于创建训练。
- legacy 本地训练器当前有效超参数主要是 `epochs`（1–100，默认 3）和 `lr0`（0.000001–1，默认 0.05）。profile 路径会记录并传递 `hyperParams`，但不能覆盖固定训练命令。
- legacy 路径创建阶段会确认模型版本和资产存在，但不会提前校验模型版本的 `storagePath`、`fileName`、`sizeBytes`；profile 路径会校验基础模型权重版本 `storagePath`。
- 前端创建后应轮询 `/api/task/detail`，不能把创建接口返回的 `pending` 当成训练已经成功启动。

响应 `data`：

| 字段 | 说明 |
| --- | --- |
| `id` | 训练实验版本 ID |
| `experimentId` | 训练实验 ID |
| `versionNo` | 实验版本号 |
| `name` | 名称 |
| `modelVersionId` | 模型版本 ID |
| `baseModelVersionId` | 基础模型权重版本 ID；当前与 `modelVersionId` 相同 |
| `codeVersionId` | 代码版本 ID |
| `trainingProfile` | 训练方案 ID；legacy 任务为空 |
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
| `modelVersionId` | string | 否 | 兼容模型版本 ID；不传继承上一版本 |
| `baseModelVersionId` | string | 否 | 基础模型权重版本 ID；不传继承上一版本，可与 `modelVersionId` 二选一，二者同时传入时必须一致 |
| `datasetVersionId` | string | 否 | 数据集版本 ID；不传继承上一版本 |
| `codeVersionId` | string | 否 | 代码版本 ID；不传继承上一版本 |
| `hyperParams` | object/string | 否 | 超参数 JSON；不传继承上一版本 |
| `params` | object/string | 否 | `hyperParams` 的兼容字段 |
| `remark` | string | 否 | 备注；不传继承上一版本 |

创建成功后 `versionNo` 为上一版本加 `1`，状态为 `pending`。新版本会继承上一版本的 `trainingProfile`，该接口不能切换训练方案；如果上一版本是 profile 任务，则新版本的 `codeVersionId` 仍必须指向已准入代码版本，并继续校验代码资产、数据集类型和基础模型权重版本。

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
- zip 数据集的 `path` 建议直接使用 `files[].path`；兼容传入 `\`，后端会规范化为 `/` 后匹配 ZIP entry。
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
- zip 内路径可以使用 `/` 或 `\`，后端统一规范化为 `/`；规范化后不能是绝对路径、盘符路径，不能包含 `..` 或空字节。
- PDF、DOCX、XLS、XLSX 首版不做在线解析，展示下载提示即可。
- `/image` 成功返回二进制流；参数错误通常返回 HTTP `400` JSON，权限错误按隐藏资源策略返回 HTTP `404` JSON。

## 14. 错误处理与安全规则

常见失败原因：

| 场景 | 典型 `errorMessage` |
| --- | --- |
| 未登录 | `请先登录: ...` |
| 无权访问资源 | `not found or no permission: ...` |
| 模型/训练任务类型非法 | `任务类型仅支持 CV, NLP, POINT_CLOUD, ROBOT` |
| 数据集任务类型非法 | `任务类型仅支持 CV, NLP, POINT_CLOUD, ROBOT, MULTIMODAL` |
| 多模态分组缺失 | `MULTIMODAL 数据集必须使用 sampleGrouping=MANIFEST 或 AUTO_DIRECTORY` |
| 非多模态使用 grouping | `仅 MULTIMODAL 数据集支持 sampleGrouping` |
| AUTO_DIRECTORY 传 manifestPath | `AUTO_DIRECTORY 不允许传 manifestPath` |
| manifest 路径非法 | `manifestPath 非法` |
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
| `sampleGrouping` | 多模态上传传 `MANIFEST` 或 `AUTO_DIRECTORY`；其他类型不传。 |
| `manifestPath` | 仅 MANIFEST 使用，默认 `manifest.json`；可使用 `/` 或 `\` 并统一规范化为 `/`；AUTO_DIRECTORY 不传。 |

上传完成后：

- 新资产首个版本自动生成 `versionNo=1`，默认标签 `v1`。
- 已有资产新增版本自动生成下一个 `versionNo`，默认标签 `v{versionNo}`。
- CV/NLP/POINT_CLOUD/ROBOT 上传完成后版本为 `READY`，并自动成为该资产的 `currentVersionId`。
- MULTIMODAL 上传完成后版本为 `DRAFT`，创建 `PENDING` ImportJob，不更新 `currentVersionId`。
- `parentVersionId` 必须属于同一资产、未删除且状态为 `READY`。
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

`/api/dataset/list` 会返回最新 DRAFT 的 `latestDraftVersionId`、`importJobId`、`importStatus`、`importProgress` 和 `importErrorMessage`。新建 MULTIMODAL 资产只有 DRAFT、尚无 READY 当前版本时，`versionId`、`currentVersionId`、`versionStatus` 等当前版本字段仍为 `null`，前端通过新增导入字段展示进度。

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

训练创建和实验新版本创建仍然必须传 `datasetVersionId`，且目标版本必须是 `READY` 并具备存储路径。普通多模态样本查询和文件访问同样只允许未删除的 `READY` 版本；`DRAFT`、`DEPRECATED`、`ARCHIVED` 均不进入该查询语义。

### 16.5 DRAFT 工作区与 READY 不可变规则

- `READY` 是稳定快照，后续 Sample/Data/Annotation 维护不得直接写入 READY。
- 样本维护服务必须先调用 `DatasetVersionLifecycleService.assertMutableDraftVersion(versionId)`。
- 需要稳定快照的内部流程可调用 `assertReadyVersion(versionId)`。
- `POST /api/dataset-versions/{readyVersionId}/draft` 物化复制父 READY 的未删除样本元数据，并复用父版本 package 关系，不复制 ZIP；ZIP-backed 单模态旧版本会先从父 ZIP 建立 PRIMARY package 和 Sample/Data 元数据。
- DRAFT 使用 workspace 专用接口查询、软删除和恢复样本；普通样本接口仍只接受 READY。
- APPEND ZIP 通过独立 package init/complete 接口加入同一 DRAFT，导入成功只扩充工作区，不更新 `currentVersionId`。
- `POST /api/dataset-versions/{draftVersionId}/publish` 完成完整性校验后把工作区原地发布为新 READY，并在事务成功时更新 `currentVersionId`。
- 父 READY 的样本、package 关系和版本状态不会被工作区编辑、APPEND 或 publish 事务修改。
- `/api/dataset/list` 通过 `latestDraftVersionId` 展示最新工作区；发布后该字段不再返回已发布版本，`currentVersionId` 指向新 READY。
- 同一资产只允许一个未删除 DRAFT。已有上传导入 DRAFT 或工作区 DRAFT 时，新建工作区都会被拒绝，避免混淆两种用途。
- 工作区 DRAFT 不能通过通用版本状态 PATCH 直接变为 READY，必须使用独立 publish 接口。
- workspace 样本删除、恢复和 publish 不直接物理删除 package ZIP。
- 当前定时维护每小时扫描失败超过 7 天的 ImportJob，并软删除其 DRAFT。只有不存在其他未删除 DatasetVersion 使用相同 `storagePath` 时，才会把该 MinIO 对象加入删除队列；工作区 DRAFT 与父 READY 共享的 PRIMARY ZIP 不会因此被删除。
- 上述保护是活动 DatasetVersion 的共享路径检查，不等同于完整的 package 引用感知物理清理；package 级清理仍属于后续增强。

## 17. 多模态与工作区数据管理当前范围

当前后端已经提供多模态数据上传和持久化导入能力：

- 数据集类型新增 `MULTIMODAL`，但共享模型/训练任务类型没有新增该值。
- 支持 `MULTIMODAL + MANIFEST/AUTO_DIRECTORY` 分片上传、动态 chunkSize、DRAFT 版本和异步 ImportJob。
- AUTO_DIRECTORY 根据 ZIP 根级样本目录生成内存 `ManifestImportPlan`，支持初始导入与 DRAFT APPEND，不改写 ZIP、不落地生成 manifest。
- 已建立 DatasetSample、DatasetSampleData、DatasetAnnotation 和 ImportJob 持久化模型。
- ImportJob 状态接口已经可用，并按数据集资产归属校验权限。
- ImportJob 支持 `FAILED -> PENDING` 的 `FULL` 重试；不支持 `PARTIAL` 重试。
- 支持 ZIP central directory range 读取、manifest 解析校验及 Sample/Data/Annotation 全量事务导入。
- 支持 executorId fencing、heartbeat、PENDING/RUNNING 恢复和卡在 COMPLETING 的上传会话恢复。
- 导入成功后版本推进为 READY，并按版本号更新 `currentVersionId`；失败后版本保持 DRAFT。
- 定时维护每小时处理失败超过 7 天的 DRAFT；仅当没有其他未删除版本共享其 `storagePath` 时，才排队清理 MinIO 对象。软删除超过 30 天、不是当前版本且无父版本/训练引用的版本会物理删除。
- 支持 READY 版本的样本分页、样本详情和样本 Data 列表查询，响应不暴露 MinIO/ZIP 定位字段。
- 支持通过 ZIP Entry Index 和 MinIO range 读取样本 Data preview/download 及 Annotation download。
- 支持 STORED VIDEO 的单段 HTTP Range preview，DEFLATED VIDEO 仅支持 download。
- 支持 `dataset_package` / `dataset_version_package`，一个版本可按 PRIMARY + APPEND 顺序使用多个物理 ZIP。
- 支持基于 READY 创建 DRAFT，并物化继承 Sample/Data/Annotation；复用 package，不复制 ZIP，不改变当前 READY。
- ZIP-backed 单模态旧版本创建 DRAFT 时可从父 ZIP 建立 PRIMARY package 和一文件一样本的 Sample/Data 元数据；非 ZIP 单模态旧版本不支持维护工作区。
- 支持向 DRAFT 追加 ZIP、查看工作区样本、软删除/恢复样本，并发布为新的 READY 快照；多模态 APPEND 使用 `MANIFEST/AUTO_DIRECTORY`，单模态 APPEND 禁止 `sampleGrouping/manifestPath`。
- 发布后 `currentVersionId` 指向新 READY，父 READY 保持不变，软删除样本不进入正式查询和文件访问。
- 已提供 READY/DRAFT 生命周期断言，统一拒绝对 READY 的直接样本修改。
- MULTIMODAL complete 不执行现有 CV/NLP/POINT_CLOUD/ROBOT zip 白名单和全量解压校验；单模态 APPEND complete 继续执行对应任务类型的 ZIP 安全与文件白名单校验。

### 17.1 后续增强（E0-G 不实现）

- PARTIAL 导入状态。
- ImportJob `PARTIAL` 或增量 retry。
- 跨版本 `external_id` 查询与对齐。
- 工作区 package 的引用感知物理 ZIP 清理。
- 工作区审计日志。
- 前端对接。

因此，初始导入或 APPEND ImportJob 必须为 `SUCCESS`，且工作区通过 publish 成为 `READY` 后，才进入正式样本查询和文件访问语义。

## 18. V2 用户型门面

`/api/v2` 用于普通业务页面，目标是由后端聚合版本、DRAFT、package、ImportJob 和存储细节。原有接口继续保留，前端可渐进迁移。

V2 成功响应直接返回强类型 DTO 或分页对象。请求已经通过鉴权拦截器并进入 V2 Controller 后，业务异常、参数异常和未预期异常使用以下失败响应：

```json
{
  "success": false,
  "errorCode": "DUPLICATE_SAMPLE",
  "errorMessage": "上传内容包含已存在的样本",
  "details": {
    "sampleName": "scene-001"
  },
  "traceId": "7f7f02e0270d4e60bc0de6005dcdb64e"
}
```

上述 V2 Controller 错误响应头同时返回 `X-Trace-Id`。未登录或被管理员权限规则拒绝时，请求在进入 Controller 前由 `PermissionInterceptor` 返回模块一 `Result` 格式，不包含 V2 `errorCode`、`traceId` 或 `X-Trace-Id`。V2 不向前端返回 MinIO objectName、ZIP offset、堆栈或内部异常类名。

常用 HTTP 状态：

| 状态 | 含义 |
| --- | --- |
| `400` | 请求参数或 JSON 格式错误 |
| `401` | 未登录；响应体为模块一 `Result` |
| `403` | 管理员权限规则拒绝；响应体为模块一 `Result` |
| `404` | 资源不存在或无权限 |
| `409` | 版本、样本或编辑状态冲突 |
| `422` | 目录、Manifest、导入或发布完整性错误 |
| `500` | 未预期服务错误 |

ImportJob 新增 `errorCode` 和结构化错误详情落库字段。`errorMessage` 只保存用户可读信息，原始技术异常仅写服务端日志。

### 18.1 数据集列表

```http
GET /api/v2/datasets?type=MULTIMODAL&keyword=&page=1&pageSize=20
```

`current` 的优先级高于 `page`；页码无效时使用 1，`pageSize` 默认 20、最大 200。

分页项字段：

| 字段 | 说明 |
| --- | --- |
| `datasetId` | 数据集资产 ID |
| `name` / `type` | 页面展示名称和类型 |
| `currentVersion` | 当前 READY 摘要：`versionId`、`versionLabel`、`versionNo`、`status` |
| `currentVersionFileCount` | 当前 READY 文件数；无当前版本或计数不可用时为 `null` |
| `fileCount` | 当前 READY 文件数；兼容前端旧列名，语义与 `currentVersionFileCount` 一致 |
| `displayStatus` | `EMPTY`、`READY`、`EDITING`、`IMPORTING` 或 `IMPORT_FAILED` |
| `hasDraft` | 是否存在活动 DRAFT |
| `editSessionId` | 活动 DRAFT ID；前端不再将其解释为内部版本状态 |
| `importProgress` | 最新导入进度 |
| `canPublish` | 后端聚合后的发布可用性 |
| `availableActions` | `VIEW`、`PREVIEW`、`EDIT`、`ADD_DATA`、`PUBLISH` 的可用子集 |
| `userError` | 导入失败时的结构化用户错误 |

状态优先级：

```text
IMPORT_FAILED > IMPORTING > EDITING > READY > EMPTY
```

该接口不返回 `storagePath`、`ownerUserId`、`currentVersionId`、`latestDraftVersionId`、`importJobId` 或原始技术错误。

### 18.2 数据集编辑会话

V2 直接使用现有 DRAFT version ID 作为 `editSessionId`，不新增编辑会话表。编辑会话支持 `MULTIMODAL` 以及 ZIP-backed `CV`、`NLP`、`POINT_CLOUD`、`ROBOT`；非 ZIP 单模态旧版本需要重新上传为 ZIP 后再进入维护工作区。

| 接口 | 说明 |
| --- | --- |
| `POST /api/v2/dataset-uploads/init` | 初始化首次数据集 ZIP 上传；请求字段兼容原上传 init |
| `POST /api/v2/dataset-uploads/{uploadId}/chunks` | 首次上传和 APPEND 共用的分片接口，multipart 参数为 `partIndex` 和 `file` |
| `GET /api/v2/dataset-uploads/{uploadId}` | 查询上传及异步导入的聚合进度 |
| `POST /api/v2/dataset-uploads/{uploadId}/complete` | 根据 upload session 自动选择首次上传或 DRAFT APPEND 完成流程 |
| `POST /api/v2/datasets/{datasetId}/edit-sessions` | 获取或创建活动 DRAFT；已有 DRAFT 时幂等返回 |
| `GET /api/v2/dataset-edit-sessions/{editSessionId}` | 聚合草稿、最新上传、ImportJob、样本数和可发布状态 |
| `POST /api/v2/dataset-edit-sessions/{editSessionId}/uploads/init` | 初始化 DRAFT APPEND ZIP 上传 |
| `POST /api/v2/dataset-edit-sessions/{editSessionId}/publish` | 校验并发布为新 READY |

publish 成功直接返回：

| 字段 | 说明 |
| --- | --- |
| `datasetId` | 数据集资产 ID |
| `currentVersion` | 展示标签，当前实现为 `v{versionNo}`，不是 datasetVersionId |
| `status` | 发布后的版本状态，正常为 `READY` |
| `publishedAt` | 发布时间 |

首次上传 init 示例：

```json
{
  "fileName": "dataset.zip",
  "fileSize": 104857600,
  "fileFingerprint": "sha256:...",
  "datasetName": "Road Scenes",
  "type": "MULTIMODAL"
}
```

`MULTIMODAL` 仍只接受 ZIP 压缩包，不增加文件夹直传。未传
`sampleGrouping` 时后端默认使用 `AUTO_DIRECTORY`，普通用户不需要提供
`manifest.json`；高级兼容场景可以显式使用 `MANIFEST`。

单模态 APPEND init 请求：

```json
{
  "fileName": "append.zip",
  "fileSize": 104857600,
  "fileFingerprint": "sha256:..."
}
```

单模态 APPEND 必须省略 `sampleGrouping` 和 `manifestPath`，并按数据集任务类型校验 ZIP 内容。`MULTIMODAL` APPEND 可继续传 `sampleGrouping=AUTO_DIRECTORY` 或 `MANIFEST`；未传时默认 `AUTO_DIRECTORY`。只有 `MANIFEST` 接受 `manifestPath`，未传时默认 `manifest.json`；`manifestPath` 可使用 `/` 或 `\` 并统一规范化为 `/`；`AUTO_DIRECTORY` 禁止传 `manifestPath`。

上传响应统一返回 `uploadId`、分片进度、`datasetId`、可选
`editSessionId`、`versionLabel`、`displayStatus`、`importProgress` 和
`userError`。不返回 `storagePath`、owner ID、dataset version ID、package
ID 或 ImportJob ID。

上传响应的 `displayStatus` 可能为 `UPLOADING`、`PROCESSING`、`IMPORTING`、`IMPORT_FAILED` 或 `READY`；它与 18.1 数据集列表的聚合状态集合不同。

`canPublish` 要求 DRAFT 至少有一个未删除样本，并且该 DRAFT 历史上的所有
ImportJob 均为 `SUCCESS`。最新 ImportJob 只用于展示进度和错误，不能覆盖
更早的失败任务。

草稿修改实时持久化，不提供没有实际保存行为的“保存草稿”接口。

### 18.3 统一预览描述

```http
GET /api/v2/dataset-versions/{versionId}/preview
```

示例：

```json
{
  "datasetVersionId": "dataset-ver-xxx",
  "mode": "ARCHIVE",
  "capabilities": ["LIST_FILES", "PREVIEW_CONTENT", "PREVIEW_IMAGE"],
  "links": {
    "items": "/api/dataset/preview/files?id=dataset-ver-xxx",
    "content": "/api/dataset/preview/content?id=dataset-ver-xxx",
    "image": "/api/dataset/preview/image?id=dataset-ver-xxx"
  }
}
```

模式映射：

| 数据集类型 | mode |
| --- | --- |
| `CV` / `NLP` | `ARCHIVE` |
| `POINT_CLOUD` | `POINT_CLOUD` |
| `MULTIMODAL` | `SAMPLE_GALLERY` |

descriptor 只统一入口和能力发现，实际内容仍复用第 6、13、15 章的接口。

### 18.4 数据集消费清单

```http
GET /api/v2/dataset-versions/{versionId}/consumer-manifest?page=1&pageSize=100
```

该接口用于训练、推理、评估或前端等模块稳定消费 READY 数据集版本内容。它只接受未删除、调用方有权限访问、状态为 `READY` 的数据集版本；DRAFT、DEPRECATED 和 ARCHIVED 不作为新的跨模块消费入口。

响应示例：

```json
{
  "datasetVersionId": "dataset-ver-ready",
  "datasetId": "dataset-asset-1",
  "type": "MULTIMODAL",
  "versionLabel": "v2",
  "status": "READY",
  "page": 1,
  "pageSize": 100,
  "totalSamples": 1,
  "samples": [
    {
      "sampleId": "sample-1",
      "externalId": "scene-001",
      "sampleIndex": 0,
      "tags": {},
      "metadata": {},
      "data": [
        {
          "sampleDataId": "data-1",
          "dataType": "IMAGE",
          "sensor": "front",
          "channel": "rgb",
          "seq": 0,
          "format": "jpg",
          "fileName": "front.jpg",
          "sizeBytes": 12345,
          "checksum": "sha256:abc",
          "contentType": "image/jpeg",
          "previewUrl": "/api/dataset-sample-data/data-1/preview",
          "downloadUrl": "/api/dataset-sample-data/data-1/download"
        }
      ],
      "annotations": [
        {
          "annotationId": "ann-1",
          "sampleDataId": "data-1",
          "annotationType": "bbox",
          "format": "json",
          "fileName": "front.json",
          "sizeBytes": 456,
          "checksum": "sha256:def",
          "contentType": "application/json",
          "downloadUrl": "/api/dataset-annotations/ann-1/download"
        }
      ]
    }
  ]
}
```

本接口不返回 `storagePath`、bucket、MinIO objectName、`ownerUserId`、packageId、ZIP offset、CRC 或数据库表结构字段。其他模块不得把 legacy 列表接口中的 `storagePath`、`importJobId`、`latestDraftVersionId` 作为长期契约。

### 18.5 模型上传 V2

| 接口 | 说明 |
| --- | --- |
| `POST /api/v2/model-uploads/init` | 保存文件信息和全部模型业务信息 |
| `POST /api/v2/model-uploads/{uploadId}/chunks` | 上传模型分片 |
| `GET /api/v2/model-uploads/{uploadId}` | 查询模型上传进度 |
| `POST /api/v2/model-uploads/{uploadId}/complete` | 只使用路径中的 `uploadId` 完成上传 |

init 请求：

```json
{
  "targetAssetId": null,
  "fileName": "model.zip",
  "fileSize": 104857600,
  "fileFingerprint": "sha256:...",
  "modelName": "YOLO Detector",
  "modelVersion": "v1",
  "taskType": "CV",
  "remark": "baseline"
}
```

- 新建模型资产时必须提供 `modelName`、`modelVersion`、`taskType` 和 `remark`。
- 给已有资产新增版本时传 `targetAssetId`；后端校验资产归属，并把资产名称、类型和备注固化到上传会话。
- 相同文件指纹仅在文件信息和模型业务信息全部一致时恢复会话。
- complete 不再接收模型名称、版本、类型、备注或目标资产。
- V2 响应不返回 `storagePath`、`ownerUserId` 或 MinIO 信息。

### 18.6 训练对接边界

V2 数据集列表和上传门面不直接提供训练动作；训练页面继续通过训练任务接口、模型版本接口、数据集版本接口和训练代码资产接口拿到具体版本 ID。

- legacy 训练仍提交 `modelVersionId`、`datasetVersionId`、`codeVersionId` 和 `hyperParams`。
- profile 训练提交 `baseModelVersionId`（或兼容字段 `modelVersionId`）、`datasetVersionId`、`codeVersionId`、`trainingProfile` 和 `hyperParams`。
- `datasetVersionId` 必须指向未删除、调用方可访问、具有存储路径的 `READY` 版本。
- legacy 路径要求模型与数据集类型匹配；profile 路径要求数据集类型符合该 `trainingProfile` 的固定要求。
- profile 路径要求 `codeVersionId` 指向 `READY` + `APPROVED` 的代码版本，并且代码资产 `trainingProfile` 与请求一致。
- 当前唯一 profile 为 `image_text_consistency_fusion_logreg`，展示名为“图文一致性基线训练”，要求代码入口 `scripts/training/train_fusion_baseline.py` 和 `NLP` 数据集。
- `MULTIMODAL` 当前不能进入训练任务类型。
- 模块二向训练侧稳定交付 READY `datasetVersionId` 和 consumer manifest；训练侧负责 batch 组装、样本选择和多模态适配。
- 训练侧不得依赖 `storagePath`、MinIO objectName、ZIP offset 或模块二数据库表结构。
- 本地训练器当前实际只支持 CV/YOLO 图片和 `labels/*.txt` 数据。
- legacy 本地训练器主要有效超参数为 `epochs`（1–100，默认 3）和 `lr0`（0.000001–1，默认 0.05）；profile 路径记录并传递 `hyperParams`，但不能覆盖固定训练命令。
