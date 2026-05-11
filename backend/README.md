# TSS AI Platform Backend

TSS AI Platform 后端服务，基于 **Java 17 + Spring Boot 3.5.14** 构建，为前端提供 `/api/**` 接口。

当前后端已经集成两部分能力：

- **模块一**：用户注册、登录、Token 鉴权、用户管理、操作日志。
- **模块二**：模型管理、数据集管理、分片上传、MinIO 文件对象、训练任务/实验版本元数据管理。

> 当前代码结构中，模块一已经收敛到 `com.tss.platform.module1`。模块二仍保留在 `com.tss.platform.controller/service/repository/entity/dto/model` 等顶层包下，后续可以在功能稳定后再重构到 `module2` 包。

模块二对前端、模块一、训练执行模块、推理模块的稳定接口边界见：

```text
doc/module2-external-contract.md
```

模块二详细测试方案见：

```text
doc/module2-test-plan.md
```

模块二测试执行细节手册见：

```text
doc/module2-test-execution-guide.md
```

模块二测试结果报告见：

```text
doc/module2-test-report.md
```

## 技术栈

| 类型 | 当前实现 |
| --- | --- |
| Java | JDK 17 |
| Web 框架 | Spring Boot 3.5.14 |
| ORM | Spring Data JPA / Hibernate 6 |
| 模块一数据访问 | MyBatis-Plus 3.5.5 |
| 登录鉴权 | Sa-Token 1.37.0 |
| 密码加密 | BCrypt |
| 默认数据库 | PostgreSQL |
| 本地开发数据库 | H2 file database，`dev` profile |
| 对象存储 | MinIO Java SDK 8.5.7 |
| 构建工具 | Maven Wrapper，Windows 使用 `mvnw.cmd` |

## 目录结构

```text
backend/
|-- pom.xml
|-- mvnw.cmd
|-- src/main/
|   |-- java/com/tss/platform/
|   |   |-- TssPlatformApplication.java
|   |   |-- config/                  # CORS、MinIO、拦截器注册
|   |   |-- module1/                 # 用户、角色、鉴权、日志
|   |   |   |-- controller/
|   |   |   |-- dto/
|   |   |   |-- entity/
|   |   |   |-- interceptor/
|   |   |   |-- mapper/
|   |   |   |-- service/
|   |   |   `-- util/
|   |   |-- controller/              # 模块二 REST API
|   |   |-- dto/                     # 模块二请求/响应对象
|   |   |-- entity/                  # 模块二 JPA 实体
|   |   |-- model/                   # 模块二领域模型
|   |   |-- repository/              # 模块二 JPA Repository
|   |   `-- service/                 # 模型、数据集、训练任务等业务逻辑
|   `-- resources/
|       |-- application.yml          # 默认 PostgreSQL + MinIO 配置
|       |-- application-dev.yml      # H2 开发配置
|       `-- db/
|           `-- module1-schema-postgresql.sql
```

## 环境要求

- JDK 17 可用。
- Docker Desktop 可用。
- PostgreSQL 容器建议名称：`tss-postgres`。
- MinIO 容器建议名称：`minio-tss`。
- 后端默认监听端口：`8080`。

当前默认数据库配置：

```yaml
spring:
  datasource:
    url: jdbc:postgresql://127.0.0.1:5432/tss
    username: postgres
    password: postgres
```

当前默认 MinIO 配置：

```yaml
minio:
  endpoint: http://127.0.0.1:9010
  access-key: admin
  secret-key: password123
  bucket: models
```

## PostgreSQL 初始化

如果 PostgreSQL 在 Docker 中运行，并且容器名是 `tss-postgres`，端口映射是 `5432:5432`，可以这样确认数据库：

```powershell
docker exec -it tss-postgres psql -U postgres -c "\l"
```

如果还没有 `tss` 数据库，创建它：

```powershell
docker exec -it tss-postgres psql -U postgres -c "create database tss;"
```

模块二的 JPA 表会由 Hibernate 自动维护。模块一使用 MyBatis-Plus，需要先执行 SQL 脚本创建 `users`、`roles`、`operation_logs`：

```powershell
Get-Content E:\resource\TSSAIPlatform\TSSAIPlatform\backend\src\main\resources\db\module1-schema-postgresql.sql | docker exec -i tss-postgres psql -U postgres -d tss
```

检查表：

```powershell
docker exec -it tss-postgres psql -U postgres -d tss -c "\dt"
```

检查角色初始数据：

```powershell
docker exec -it tss-postgres psql -U postgres -d tss -c "select * from roles;"
```

正常应包含：

```text
1 | super_admin | Super administrator
2 | admin       | Administrator
3 | user        | Normal user
```

## MinIO 启动示例

如果本机还没有 MinIO，可以在仓库根目录执行：

```powershell
docker run -d --name minio-tss `
  -p 9010:9000 -p 9011:9001 `
  -e MINIO_ROOT_USER=admin `
  -e MINIO_ROOT_PASSWORD=password123 `
  -v ${PWD}\tss_minio_data:/data `
  minio/minio server /data --console-address ":9001"
```

MinIO 控制台：

```text
http://127.0.0.1:9011
```

登录账号：

```text
admin / password123
```

后端启动时会自动检查并创建 `models` bucket。

## 构建和启动

进入后端目录：

```powershell
cd E:\resource\TSSAIPlatform\TSSAIPlatform\backend
```

编译：

```powershell
.\mvnw.cmd -DskipTests compile
```

完整打包：

```powershell
.\mvnw.cmd clean package -DskipTests
```

启动：

```powershell
.\mvnw.cmd spring-boot:run
```

启动成功时会看到类似日志：

```text
Tomcat started on port 8080
Started TssPlatformApplication
```

运行 jar：

```powershell
java -jar target\tss-backend-1.0.0.jar
```

使用 H2 开发 profile：

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
```

或：

```powershell
java -jar target\tss-backend-1.0.0.jar --spring.profiles.active=dev
```

## 模块一接口自测

注册用户：

```powershell
$body = @{
  username = "testuser"
  password = "test123"
  confirmPassword = "test123"
  roleId = 3
} | ConvertTo-Json -Compress

Invoke-RestMethod `
  -Uri "http://127.0.0.1:8080/api/user/register/username" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

登录并保存 Token：

```powershell
$loginBody = @{
  type = "account"
  username = "testuser"
  password = "test123"
} | ConvertTo-Json -Compress

$loginResult = Invoke-RestMethod `
  -Uri "http://127.0.0.1:8080/api/user/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body $loginBody

$token = $loginResult.data.token
$token
```

获取当前用户：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8080/api/user/current-user" `
  -Method Get `
  -Headers @{ Authorization = "Bearer $token" }
```

查询操作日志：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8080/api/log/list" `
  -Method Get `
  -Headers @{ Authorization = "Bearer $token" }
```

模块一接口返回格式：

```json
{
  "code": 200,
  "message": "操作结果",
  "data": {}
}
```

> 迁移自 demo 的部分 message/log 文案可能仍有乱码，不影响接口逻辑。后续可以统一清理为正常中文或英文。

## 鉴权说明

当前 `WebConfig` 已对模块一与模块二核心接口启用权限拦截：

```text
/api/user/**
/api/log/**
/api/model/**
/api/model-assets/**
/api/model-versions/**
/api/dataset/**
/api/dataset-assets/**
/api/dataset-versions/**
/api/task/**
/api/experiments/**
/api/files/**
```

公开接口：

```text
POST /api/user/register/username
POST /api/user/register/mobile
POST /api/user/sms/code
POST /api/user/forget/password
POST /api/user/login
GET  /api/files/health
```

其余受保护接口需要请求头：

```text
Authorization: Bearer <token>
```

模块一通过 Sa-Token session 中的 `roleId` 判断管理员权限，`roleId=1/2` 视为管理员，`roleId=3` 视为普通用户。

模块二模型、数据集、上传会话和训练实验已经增加 `owner_user_id`。普通用户查询列表、详情、删除时只允许访问自己的资源；管理员可以访问全部资源。

MinIO 仍使用一个后端服务账号连接，业务隔离通过数据库 `owner_user_id` 与对象路径前缀实现：

```text
users/{userId}/models/...
users/{userId}/datasets/...
users/{userId}/files/...
```

`/api/files/health` 保持公开用于健康检查；其他 `/api/files/**` 接口需要登录，并会校验对象路径归属。

## 主要接口概览

### 模块一：用户、鉴权、日志

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/user/register/username` | POST | 用户名注册 |
| `/api/user/register/mobile` | POST | 手机号注册 |
| `/api/user/sms/code` | POST | 发送短信验证码，当前为内存模拟 |
| `/api/user/login` | POST | 账号或手机号登录 |
| `/api/user/logout` | POST | 退出登录 |
| `/api/user/current-user` | GET | 当前登录用户 |
| `/api/user/list` | GET | 用户列表，含角色名 |
| `/api/user/add` | POST | 管理员新增用户 |
| `/api/user/reset-password` | POST | 管理员重置密码 |
| `/api/user/delete/{userId}` | DELETE | 软删除用户 |
| `/api/log/record` | POST | 记录操作日志 |
| `/api/log/list` | GET | 查询操作日志 |

### 兼容旧前端的演示登录

以下接口仍存在于 `AuthController`，用于兼容原 Ant Design Pro 登录流程，不是真实模块一鉴权：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/login/account` | POST | 演示账号登录 |
| `/api/currentUser` | GET | 演示当前用户 |
| `/api/login/outLogin` | POST | 演示退出 |

后续前端应逐步切换到 `/api/user/login`、`/api/user/current-user`、`/api/user/logout`。

### 模块二：MinIO 文件对象

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/files/health` | GET | 检查 MinIO 连接 |
| `/api/files/upload` | POST | 上传单个对象 |
| `/api/files/download?objectName=...` | GET | 下载对象 |
| `/api/files/delete?objectName=...` | DELETE | 删除对象 |

### 模块二：模型管理

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/model/upload/init` | POST | 初始化模型分片上传 |
| `/api/model/upload/chunk` | POST | 上传模型分片 |
| `/api/model/upload/progress` | GET | 查询模型上传进度 |
| `/api/model/upload/complete` | POST | 合并分片并创建模型资产/版本 |
| `/api/model/list` | GET | 模型版本列表 |
| `/api/model/detail?id=...` | GET | 模型详情 |
| `/api/model/code-files?id=...` | GET | 列出 zip 内可预览代码文件 |
| `/api/model/previewCode?id=...&path=...` | GET | 预览 zip 内文本代码 |
| `/api/model/delete?id=...` | DELETE | 删除模型版本并尝试删除 MinIO 文件 |
| `/api/model-assets` | GET/POST | 模型资产 CRUD |
| `/api/model-assets/{id}` | GET/PUT/DELETE | 模型资产详情、更新、删除 |
| `/api/model-versions` | GET/POST | 模型版本 CRUD |
| `/api/model-versions/{id}` | GET/PUT/DELETE | 模型版本详情、更新、删除 |

模型上传规则：

- 模型文件仅支持 `.zip`。
- `type` 支持 `CV` 和 `NLP`。
- 分片大小由后端服务固定为 5MiB。

### 模块二：数据集管理

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/dataset/list` | GET | 数据集聚合列表 |
| `/api/dataset/upload/init` | POST | 初始化数据集分片上传 |
| `/api/dataset/upload/chunk` | POST | 上传数据集分片 |
| `/api/dataset/upload/progress` | GET | 查询数据集上传进度 |
| `/api/dataset/upload/complete` | POST | 合并分片并创建数据集资产/版本 |
| `/api/dataset/upload/folder` | POST | 上传 CV 图片文件夹，后端打包为 zip |
| `/api/dataset-assets` | GET/POST | 数据集资产 CRUD |
| `/api/dataset-assets/{id}` | GET/PUT/DELETE | 数据集资产详情、更新、删除 |
| `/api/dataset-versions` | GET/POST | 数据集版本 CRUD |
| `/api/dataset-versions/{id}` | GET/PUT/DELETE | 数据集版本详情、更新、删除 |

数据集上传规则：

- `CV` 支持 zip，压缩包内必须包含图片文件；也支持 `/api/dataset/upload/folder` 直接上传图片文件夹。
- `CV` 额外支持 `cvTaskType` 和 `annotationFormat` 两个元数据字段，主任务类型仍保持 `type=CV`。
- `cvTaskType` 支持 `IMAGE_CLASSIFICATION`、`OBJECT_DETECTION`、`SEMANTIC_SEGMENTATION`、`INSTANCE_SEGMENTATION`、`UNLABELED`、`OTHER`，也兼容中文值：`图像分类`、`目标检测`、`语义分割`、`实例分割`、`无标注`、`其他`。
- `annotationFormat` 支持 `NONE`、`FOLDER_CLASSIFICATION`、`CSV`、`YOLO`、`COCO`、`VOC`、`MASK`、`LABELME`、`OTHER`，也兼容中文值：`无标注`、`文件夹分类`、`掩码`、`其他`。
- CV 图片扩展名支持 `.jpg`、`.jpeg`、`.png`、`.bmp`、`.gif`、`.webp`、`.tif`、`.tiff`。
- CV 标注格式校验规则：`NONE/FOLDER_CLASSIFICATION/MASK` 只允许图片；`CSV` 允许图片和 `.csv`；`YOLO` 允许图片和 `.txt/.yaml/.yml`；`COCO/LABELME` 允许图片和 `.json`；`VOC` 允许图片和 `.xml`；`OTHER` 允许图片和 `.txt/.json/.xml/.csv/.yaml/.yml`。
- `NLP` 支持 `.txt`、`.json`、`.jsonl`、`.csv`、`.xlsx`、`.xls`、`.pdf`、`.docx`、`.xml`，也支持仅包含这些文件的 zip。

### 模块二：训练任务与实验版本

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

当前训练模块只管理实验、版本、状态、超参数、模型版本和数据集版本之间的关系，暂未调度真实训练作业。

## 数据表

模块一手动 SQL 表：

```text
roles
users
operation_logs
```

模块二 JPA 表：

```text
model_asset
model_version
model_upload_session
model_upload_chunk
dataset_asset
dataset_version
dataset_upload_session
dataset_upload_chunk
training_experiment_version
```

## 分片上传说明

模型和数据集分片上传流程一致：

1. 调用 `init` 获取 `uploadId`、`chunkSize`、`totalChunks`、`uploadedPartIndexes`。
2. 前端按 `chunkSize` 切片，只上传缺失分片。
3. 中断后重新调用 `init` 或 `progress`，根据已上传分片继续上传。
4. 全部分片上传完成后调用 `complete`。
5. 后端使用 MinIO `composeObject` 合并最终文件，落库资产/版本记录，并清理临时分片。

默认单片大小为 5MiB。`application.yml` 中的 `64MB` multipart 限制只约束单个 HTTP 请求，不限制模型或数据集的总文件大小。

MinIO 对象路径约定：

| 类型 | 路径 |
| --- | --- |
| 模型临时分片 | `users/{userId}/models/_uploads/{uploadId}/part-{index}` |
| 模型最终文件 | `users/{userId}/models/{modelName}/{version}/{fileName}` |
| 数据集临时分片 | `users/{userId}/datasets/_uploads/{uploadId}/part-{index}` |
| 数据集最终文件 | `users/{userId}/datasets/{assetId}/{version}/{fileName}` |
| 通用文件对象 | `users/{userId}/files/{objectName}` |

## 常用配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | `default` | 设置为 `dev` 时使用 H2 |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://127.0.0.1:5432/tss` | PostgreSQL 地址 |
| `SPRING_DATASOURCE_USERNAME` | `postgres` | 数据库用户名 |
| `SPRING_DATASOURCE_PASSWORD` | `postgres` | 数据库密码 |
| `server.port` | `8080` | 后端端口 |
| `spring.servlet.multipart.max-file-size` | `64MB` | 单个 multipart 文件大小限制 |
| `spring.servlet.multipart.max-request-size` | `64MB` | 单个 multipart 请求大小限制 |
| `sa-token.token-name` | `Authorization` | 模块一 Token 请求头 |

## 常见问题

### package 阶段提示 jar 无法重命名

如果报错类似：

```text
Unable to rename target\tss-backend-1.0.0.jar to target\tss-backend-1.0.0.jar.original
```

通常是旧的 jar 或 `spring-boot:run` 进程还在运行。先在运行后端的终端按 `Ctrl+C`，再执行：

```powershell
.\mvnw.cmd clean package -DskipTests
```

### PostgreSQL 表不存在

模块一表不会由 JPA 自动创建，需要执行：

```powershell
Get-Content E:\resource\TSSAIPlatform\TSSAIPlatform\backend\src\main\resources\db\module1-schema-postgresql.sql | docker exec -i tss-postgres psql -U postgres -d tss
```

### MinIO 连接失败

确认 MinIO API 端口是 `9010`，账号密码与 `application.yml` 一致。可访问：

```text
GET http://127.0.0.1:8080/api/files/health
```

### 大文件超过 64MB 是否会失败

不会。模型和数据集上传走 5MiB 分片，只要单个分片请求小于 multipart 限制，总文件可以远大于 64MB。

### 前端还在走 `/api/login/account`

旧演示登录接口仍存在，但真实用户体系已经在 `/api/user/login`。后续前端需要保存模块一登录返回的 token，并在请求头中携带：

```text
Authorization: Bearer <token>
```

## 当前边界

- 模块一短信验证码为内存模拟，服务重启后缓存会丢失。
- 模块一部分迁移自 demo 的业务 message/log 文案可能仍有编码问题，后续可统一清理。
- 模块二训练任务只管理元数据，暂未接入真实训练调度器。
- 旧模型、数据集、实验记录如果 `owner_user_id` 为空，普通用户默认不可见，管理员可见；如需普通用户访问旧数据，需要补齐归属字段。
- 模块二业务操作审计仍可继续增强，例如模型/数据集上传、删除、训练状态变更等。
- 默认 PostgreSQL 和 MinIO 账号密码仅适合本地开发，不应直接用于生产环境。
