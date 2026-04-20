# 数据集 10GB 断点续传验收记录

## 验收目标

证明数据集上传链路满足：

- 单文件不小于 10GB 时，按分片方式上传。
- 传统 `spring.servlet.multipart.max-file-size` 单次请求限制不再约束数据集总文件大小。
- 网络中断、浏览器刷新或脚本中断后，可通过已上传分片记录继续上传。
- 上传完成后自动生成数据集资产和数据集版本记录，训练创建页可查询并选择该数据集版本。

## 当前实现口径

| 项 | 结论 |
| --- | --- |
| 数据集上传入口 | `/api/dataset/upload/init`、`/chunk`、`/progress`、`/complete` |
| 分片大小 | 5MiB，即 `5242880` bytes |
| 10GiB 分片数 | `10 * 1024 * 1024 * 1024 / 5242880 = 2048` |
| 单次 multipart 限制 | `64MB`，只限制单个分片请求，不限制总文件大小 |
| MinIO 合并 | complete 使用 `composeObject` 合并临时分片 |
| 断点依据 | 数据库保存 `dataset_upload_session` 和 `dataset_upload_chunk` |
| 续传依据 | `progress.uploadedPartIndexes` 返回已上传分片序号 |
| 完成后产物 | `dataset_asset` 与 `dataset_version` 记录 |
| 临时分片清理 | complete 后删除 `datasets/_uploads/{uploadId}/...` 临时对象和分片记录 |

因此 10GiB 文件会被拆成 2048 个约 5MiB 的请求，每个请求小于 64MB；文件总大小不再受原 100MB 常规直传限制影响。

## 演示前准备

1. 启动 MinIO，并确认 API 端口为 `9010`。
2. 启动后端：

```powershell
cd E:\resource\TSSAIPlatform\TSSAIPlatform\backend
.\mvnw.cmd spring-boot:run
```

3. 使用 H2 本地 profile 时：

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
```

## 演示脚本

脚本位置：

```text
TSSAIPlatform/scripts/dataset-upload-resume-demo.ps1
```

该脚本会：

- 可选创建一个 10GiB 演示文件。
- 调用 init 获取或恢复 `uploadId`。
- 按 5MiB 切片上传。
- 可用 `-StopAfterChunks` 主动中断。
- 重新运行同一命令时自动续传缺失分片。
- 全部分片上传后调用 complete 生成数据集资产和版本。

## 中断恢复演示步骤

### 1. 创建 10GiB 文件并模拟中断

```powershell
cd E:\resource\TSSAIPlatform\TSSAIPlatform
.\scripts\dataset-upload-resume-demo.ps1 `
  -BaseUrl http://127.0.0.1:8080 `
  -FilePath .\tmp\dataset-10gb-demo.zip `
  -DatasetName dataset-10gb-demo `
  -Version v10gb `
  -Type CV `
  -CreateSparse10GB `
  -StopAfterChunks 3
```

预期记录：

```text
uploadId=dataset-upload-...
fileSize=10737418240 bytes, chunkSize=5242880, totalChunks=2048
Uploaded part 0; progress=1/2048
Uploaded part 1; progress=2/2048
Uploaded part 2; progress=3/2048
Simulated interruption after 3 newly uploaded chunks.
Upload is not complete yet. Re-run this script with the same parameters to resume.
```

### 2. 查询中断后的服务端进度

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8080/api/dataset/upload/progress?uploadId=<上一步 uploadId>"
```

预期关键字段：

```json
{
  "success": true,
  "data": {
    "status": "UPLOADING",
    "fileSize": 10737418240,
    "chunkSize": 5242880,
    "totalChunks": 2048,
    "uploadedChunks": 3,
    "uploadedPartIndexes": [0, 1, 2]
  }
}
```

### 3. 重新运行同一命令续传

```powershell
.\scripts\dataset-upload-resume-demo.ps1 `
  -BaseUrl http://127.0.0.1:8080 `
  -FilePath .\tmp\dataset-10gb-demo.zip `
  -DatasetName dataset-10gb-demo `
  -Version v10gb `
  -Type CV
```

预期现象：

- init 返回同一个未完成 `uploadId`。
- 脚本从 `uploadedPartIndexes` 中跳过已上传分片。
- 从缺失分片继续上传。
- 全部完成后返回数据集版本结果。

预期完成响应：

```json
{
  "uploadId": "dataset-upload-...",
  "id": "dataset-ver-...",
  "assetId": "dataset-asset-...",
  "name": "dataset-10gb-demo",
  "version": "v10gb",
  "type": "CV",
  "fileName": "dataset-10gb-demo.zip",
  "storagePath": "datasets/dataset-asset-.../v10gb/dataset-10gb-demo.zip",
  "sizeBytes": 10737418240,
  "status": "COMPLETED"
}
```

### 4. 验证训练创建页可选择

1. 打开前端。
2. 进入「发起训练」。
3. 选择 `CV` 模型版本。
4. 数据集版本下拉中应出现 `dataset-10gb-demo / v10gb / CV`。

## 浏览器验收口径

浏览器刷新后不会保留 `File` 对象，因此续传操作为：

1. 上传数据集时中断或刷新页面。
2. 页面恢复表单和提示信息。
3. 用户重新选择同一个文件。
4. 前端使用相同 `fileFingerprint` 调用 init/progress。
5. 前端跳过 `uploadedPartIndexes` 中已上传分片，继续上传缺失分片。

该行为满足“刷新后续传”和“网络中断后恢复”的验收表达。

## 验收结论

当前实现可支撑不小于 10GB 的单文件数据集分片上传。  
10GiB 文件按 5MiB 分片共 2048 个请求，单请求不超过 64MB multipart 限制。  
上传进度持久化在数据库中，网络中断或页面刷新后可按 `uploadId` / `fileFingerprint` 恢复并继续上传。  
上传完成后自动生成数据集资产与版本记录，可被训练创建页选择使用。
