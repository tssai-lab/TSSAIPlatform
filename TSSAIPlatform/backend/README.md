# TSS AI Platform 后端服务

本目录是 TSS AI Platform 的 Java 后端，基于 **Spring Boot 2.7.18 + Spring Data JPA + MinIO** 构建，为 Ant Design Pro 前端提供 `/api/**` 接口。

当前后端负责：

- 演示登录、当前用户与登出接口
- 模型资产、模型版本、模型分片上传与代码预览
- 数据集资产、数据集版本、数据集分片断点续传与 CV 图片文件夹上传
- MinIO 通用文件上传、下载、删除与健康检查
- 训练任务/实验版本元数据管理

> 注意：训练任务模块目前只保存实验版本、超参数、模型版本和数据集版本之间的关系，不会真正调度训练作业。

## 技术栈

| 类型 | 当前实现 |
| --- | --- |
| 运行环境 | JDK 17+ |
| Web 框架 | Spring Boot 2.7.18 |
| 数据访问 | Spring Data JPA / Hibernate |
| 默认数据库 | PostgreSQL |
| 本地开发数据库 | H2 file database，`dev` profile |
| 对象存储 | MinIO Java SDK 8.5.7 |
| 构建工具 | Maven Wrapper，Windows 脚本为 `mvnw.cmd` |

## 目录结构

```text
backend/
├─ pom.xml
├─ mvnw.cmd
├─ data/                         # dev profile 的 H2 本地库目录
└─ src/main/
   ├─ java/com/tss/platform/
   │  ├─ config/                 # Web、MinIO 配置与 bucket 初始化
   │  ├─ controller/             # REST API
   │  ├─ dto/                    # 请求与响应对象
   │  ├─ entity/                 # JPA 实体
   │  ├─ model/                  # 领域枚举/模型
   │  ├─ repository/             # JPA Repository
   │  └─ service/                # 上传、预览、训练实验等业务逻辑
   └─ resources/
      ├─ application.yml         # 默认配置，PostgreSQL + MinIO
      └─ application-dev.yml     # 本地 H2 配置
```

详细接口文档见：[`../docs/backend-api.md`](../docs/backend-api.md)。

## 环境要求

- 安装并配置 **JDK 17+**，确保 `JAVA_HOME` 可用。
- 启动 **MinIO**，后端默认连接 `http://127.0.0.1:9010`。
- 使用默认 profile 时，需要本机 PostgreSQL：
  - 数据库：`tss`
  - 用户名：`postgres`
  - 密码：`postgres`
  - 地址：`127.0.0.1:5432`
- 本地快速开发可改用 H2，无需 PostgreSQL。

项目自带 Maven Wrapper，通常不需要单独安装 Maven。

## MinIO 配置

默认配置位于 `src/main/resources/application.yml`：

```yaml
minio:
  endpoint: http://127.0.0.1:9010
  access-key: admin
  secret-key: password123
  bucket: models
```

服务启动时会自动检查并创建 `models` bucket。对象文件建议通过 Docker volume 挂载到仓库根目录的 `tss_minio_data`，当前项目说明中约定的容器名为 `minio-tss`，API 端口为 `9010`。

如果本机还没有 MinIO，可参考下面的 PowerShell 示例在仓库根目录启动：

```powershell
docker run -d --name minio-tss `
  -p 9010:9000 -p 9011:9001 `
  -e MINIO_ROOT_USER=admin `
  -e MINIO_ROOT_PASSWORD=password123 `
  -v ${PWD}\tss_minio_data:/data `
  minio/minio server /data --console-address ":9001"
```

控制台地址为 `http://127.0.0.1:9011`，登录账号为 `admin / password123`。

## 启动方式

进入后端目录：

```powershell
cd TSSAIPlatform\backend
```

使用默认 PostgreSQL 配置启动：

```powershell
.\mvnw.cmd spring-boot:run
```

使用 H2 本地库启动：

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
```

启动成功后，后端地址为：

```text
http://127.0.0.1:8080
```

前端开发时，在项目根目录运行 `npm start` 或 `npm run start:dev`，Umi 会把 `/api/*` 代理到 `http://127.0.0.1:8080`。

## 构建与运行 Jar

```powershell
cd TSSAIPlatform\backend
.\mvnw.cmd -DskipTests package
java -jar target\tss-backend-1.0.0.jar
```

如需指定 H2 profile：

```powershell
java -jar target\tss-backend-1.0.0.jar --spring.profiles.active=dev
```

## 配置项

常用配置支持通过环境变量覆盖：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | `default` | 设为 `dev` 时使用 H2 |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://127.0.0.1:5432/tss` | 默认数据库地址 |
| `SPRING_DATASOURCE_USERNAME` | `postgres` | 数据库用户名 |
| `SPRING_DATASOURCE_PASSWORD` | `postgres` | 数据库密码 |
| `server.port` | `8080` | 后端端口 |
| `spring.servlet.multipart.max-file-size` | `64MB` | 单次 multipart 请求上限 |
| `spring.servlet.multipart.max-request-size` | `64MB` | 单次 multipart 请求总上限 |

分片上传的单片大小由代码固定为 **5MiB**。`64MB` multipart 限制只约束单个分片请求，不限制模型或数据集总文件大小。

## 数据存储

默认 profile 使用 PostgreSQL，并由 JPA 自动维护表结构：

- `model_asset` / `model_version`
- `model_upload_session` / `model_upload_chunk`
- `dataset_asset` / `dataset_version`
- `dataset_upload_session` / `dataset_upload_chunk`
- `training_experiment_version`

`dev` profile 使用 H2 文件库，数据文件位于 `backend/data/tss.mv.db`。上传会话、已上传分片和业务元数据都会写入数据库，因此页面刷新或网络中断后可以继续上传。

MinIO 中的主要对象路径：

| 类型 | 路径 |
| --- | --- |
| 模型临时分片 | `models/_uploads/{uploadId}/part-{index}` |
| 模型最终文件 | `models/{modelName}/{version}/{fileName}` |
| 数据集临时分片 | `datasets/_uploads/{uploadId}/part-{index}` |
| 数据集最终文件 | `datasets/{assetId}/{version}/{fileName}` |

## 通用响应格式

除 `POST /api/login/account` 和文件下载接口外，大多数接口返回：

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

## 演示登录

当前登录接口是前端联调用的演示逻辑，没有 Session/JWT 鉴权。

| 用户名 | 密码 | 权限 |
| --- | --- | --- |
| `admin` | `ant.design` | `admin` |
| `user` | `ant.design` | `user` |

相关接口：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/login/account` | POST | 账号登录 |
| `/api/currentUser` | GET | 获取当前用户 |
| `/api/login/outLogin` | POST | 退出登录 |

## 主要接口概览

### MinIO 文件对象

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/files/health` | GET | 检查 MinIO 连接 |
| `/api/files/upload` | POST | 上传单个对象 |
| `/api/files/download?objectName=...` | GET | 下载对象 |
| `/api/files/delete?objectName=...` | DELETE | 删除对象 |

### 模型管理

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/model/upload/init` | POST | 初始化模型分片上传 |
| `/api/model/upload/chunk` | POST | 上传模型分片 |
| `/api/model/upload/progress` | GET | 查询模型上传进度 |
| `/api/model/upload/complete` | POST | 合并分片，创建模型资产和版本 |
| `/api/model/list` | GET | 模型版本列表 |
| `/api/model/detail?id=...` | GET | 模型详情 |
| `/api/model/code-files?id=...` | GET | 列出模型 zip 内可预览代码文件 |
| `/api/model/previewCode?id=...&path=...` | GET | 预览模型 zip 内文本/代码 |
| `/api/model/delete?id=...` | DELETE | 删除模型版本并尝试删除 MinIO 文件 |
| `/api/model-assets` | GET/POST | 模型资产 CRUD |
| `/api/model-assets/{id}` | GET/PUT/DELETE | 模型资产详情、更新、删除 |
| `/api/model-versions` | GET/POST | 模型版本 CRUD |
| `/api/model-versions/{id}` | GET/PUT/DELETE | 模型版本详情、更新、删除 |

模型上传要求：

- 模型文件仅支持 `.zip`。
- `type` 仅支持 `CV` 或 `NLP`。
- 完成上传时会创建新的模型资产和模型版本。
- zip 内代码预览会读取 MinIO 文件，单文件预览上限见 `ModelCodePreviewService`。

### 数据集管理

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/dataset/list` | GET | 数据集聚合列表，可按 `type` 筛选 |
| `/api/dataset/upload/init` | POST | 初始化数据集分片上传 |
| `/api/dataset/upload/chunk` | POST | 上传数据集分片 |
| `/api/dataset/upload/progress` | GET | 查询数据集上传进度 |
| `/api/dataset/upload/complete` | POST | 合并分片，创建数据集资产和版本 |
| `/api/dataset/upload/folder` | POST | 上传 CV 图片文件夹，后端打包为 zip |
| `/api/dataset-assets` | GET/POST | 数据集资产 CRUD |
| `/api/dataset-assets/{id}` | GET/PUT/DELETE | 数据集资产详情、更新、删除 |
| `/api/dataset-versions` | GET/POST | 数据集版本 CRUD |
| `/api/dataset-versions/{id}` | GET/PUT/DELETE | 数据集版本详情、更新、删除 |

数据集上传规则：

- `CV` 支持 zip，压缩包内必须包含图片文件；也支持 `/api/dataset/upload/folder` 直接上传图片文件夹。
- CV 图片扩展名支持 `.jpg`、`.jpeg`、`.png`、`.bmp`、`.gif`、`.webp`、`.tif`、`.tiff`。
- `NLP` 支持 `.txt`、`.json`、`.jsonl`，也支持包含这些文件的 zip。
- 数据集资产和数据集版本删除接口会同步删除对应 MinIO 对象；删除对象失败时不会删除数据库记录。

### 训练任务与实验版本

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/task/create` | POST | 创建训练任务，生成实验版本 `versionNo=1` |
| `/api/task/list` | GET | 训练任务列表，每个实验返回最新版本 |
| `/api/task/detail?id=...` | GET | 查询训练任务详情 |
| `/api/task/stop?id=...` | POST | 将任务状态改为 `stopped` |
| `/api/task/delete?id=...` | DELETE | 删除一个实验下的所有版本 |
| `/api/experiments` | POST | 创建训练实验，等价于 `/api/task/create` |
| `/api/experiments/{experimentId}/versions` | GET | 查看实验版本历史 |
| `/api/experiments/{experimentId}/versions` | POST | 创建实验新版本 |
| `/api/experiments/{experimentId}/versions/{versionNo}` | GET | 查看指定实验版本 |
| `/api/experiments/{experimentId}/versions/{versionNo}/hyper-parameters` | PUT | 修改指定版本超参数 |

发起训练时，后端会校验模型版本和数据集版本的任务类型是否一致：`CV` 只能搭配 `CV`，`NLP` 只能搭配 `NLP`。

## 分片上传流程

模型和数据集分片上传流程一致：

1. 调用 `init`，获得 `uploadId`、`chunkSize`、`totalChunks` 和 `uploadedPartIndexes`。
2. 前端按 `chunkSize` 切片，只上传缺失分片。
3. 网络中断或页面刷新后，重新调用 `init` 或 `progress`，根据 `uploadedPartIndexes` 跳过已上传分片。
4. 全部分片完成后调用 `complete`。
5. 后端使用 MinIO `composeObject` 合并最终文件，落库资产/版本记录，并清理临时分片。

当前实现已按 5MiB 分片支撑 10GiB 数据集续传验收；相关记录见 `../docs/dataset-upload-10gb-acceptance.md` 和 `../docs/module2-acceptance-report.md`。

## 前端联调

1. 启动 MinIO。
2. 启动后端：

```powershell
cd TSSAIPlatform\backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
```

3. 启动前端：

```powershell
cd TSSAIPlatform
npm start
```

4. 打开前端默认地址，使用 `admin / ant.design` 登录。

前端 API 封装主要位于：

- `src/services/ant-design-pro/api.ts`
- `src/services/ant-design-pro/model.ts`
- `src/services/ant-design-pro/dataset.ts`
- `src/services/ant-design-pro/files.ts`
- `src/services/ant-design-pro/task.ts`

## 常见问题

### MinIO 连接失败

确认 MinIO API 端口是 `9010`，账号密码与 `application.yml` 一致。可访问：

```text
GET http://127.0.0.1:8080/api/files/health
```

### 默认启动时报数据库连接失败

默认 profile 会连接 PostgreSQL。如果本机没有 PostgreSQL，请使用 H2：

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
```

### 大文件超过 64MB 是否会失败

不会。`64MB` 是单次 multipart 请求限制，模型和数据集上传会被切成 5MiB 分片。只要每个分片请求小于限制，总文件可以远大于 64MB。

### 训练任务为什么不真正运行

当前后端只实现训练实验版本管理和前端展示所需状态字段，暂未接入训练调度器。后续可在 `/api/task/create` 创建元数据后，对接队列、容器任务或训练平台执行真实作业。

## 当前实现边界

- 登录为演示逻辑，生产环境需要补充认证、鉴权和密码存储。
- 列表接口目前未做分页，数据量增大后建议增加 `page`、`pageSize`、`keyword` 等查询参数。
- 模型完成上传时总是创建新的模型资产，不会按同名模型自动复用旧资产。
- 模型资产 CRUD 删除只删除资产记录；需要删除模型文件时优先使用 `/api/model/delete?id={versionId}`。
- MinIO、PostgreSQL 默认账号密码仅适合本地开发，请勿直接用于生产环境。
