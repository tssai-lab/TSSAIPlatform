# TSS AI Platform

TSS AI Platform 是一个面向人工智能模型开发、训练和推理的管理平台。

平台将基础模型、数据集和训练代码分别进行版本化管理，用户可以在创建训练任务时选择对应版本和训练方案，由后端通过 Kubernetes 提交训练任务。训练完成后，产物可以发布为新的模型版本，并继续用于推理任务。

> 当前项目处于开发与联调阶段。能够使用的训练类型以 `backend` 分支中已经注册的训练方案为准。

## 主要功能

- 用户、角色和权限管理
- 模型资产和模型版本管理
- 数据集资产和数据集版本管理
- 训练代码上传、检查和版本管理
- 训练方案管理
- Kubernetes 训练任务调度
- 训练状态、进度、日志、指标和产物管理
- 训练产物发布为新模型版本
- 单文件及批量推理任务
- 计算节点和资源状态管理

## 系统组成

```text
浏览器
  │
  ▼
前端：React + UmiJS + Ant Design
  │  /api
  ▼
后端：Java 17 + Spring Boot
  ├── PostgreSQL：用户、资产、任务和版本信息
  ├── MinIO：模型、数据集、代码及训练推理产物
  ├── Kubernetes：训练和推理 Worker
  └── MLflow：实验指标和运行记录
```

本项目采用前后端分离架构。当前前端和后端代码保存在同一个 GitHub 仓库的不同分支中，获取代码时需要选择对应分支。

## 分支说明

### 长期分支

| 分支 | 用途 | 使用规则 |
| --- | --- | --- |
| `main` | 项目总入口和使用说明 | 只维护本 README，不在此分支开发前后端功能 |
| `backend` | 后端稳定候选分支 | 后端功能完成验证后，通过 PR 合入此分支 |
| `backend-ops` | 后端及基础设施集成验证 | 用于部署、镜像和主节点联调，不作为普通功能开发分支 |
| `frontend-dev` | 前端日常开发和集成分支 | 前端功能完成验证后，通过 PR 合入此分支 |
| `frontend-main` | 前端稳定/历史发布分支 | 当前仍会触发前端部署，未经负责人确认不要直接推送 |

### 当前专项开发分支

| 分支 | 方向 |
| --- | --- |
| `backend-feat/inference` | 后端推理模块 |
| `feature/fabric8-control-client` | Kubernetes Fabric8 控制能力 |
| `feature/gpu-distributed-training` | GPU 分布式训练 |
| `frontend-feat/inference` | 前端推理模块 |
| `frontend-feat/model_inference` | 前端模型推理功能 |
| `frontend-feat/training-module` | 前端训练模块 |

专项分支用于尚未完成合入的工作，不应被当作稳定部署入口。开始修改专项分支前，应先确认负责人和合入状态，避免在已经废弃或已经合入的分支上继续开发。

### 分支开发规则

1. 后端新功能从最新的 `backend` 创建分支。
2. 前端新功能从最新的 `frontend-dev` 创建分支。
3. 功能分支建议命名为 `feature/<功能名>`、`backend-feat/<功能名>` 或 `frontend-feat/<功能名>`。
4. 功能开发完成后先完成构建和测试，再通过 Pull Request 合入对应长期分支。
5. 不要把前端功能分支直接合入 `backend`，也不要把后端功能分支直接合入 `frontend-dev`。
6. 不要在 `main` 中复制一份前端或后端源码；`main` 只作为项目入口。
7. 删除、合并长期分支或修改部署分支前，必须先与项目负责人确认。

## 获取代码

仓库地址：

```text
https://github.com/tssai-lab/TSSAIPlatform.git
```

由于当前前后端位于不同分支，建议分别克隆到两个目录。

### 获取后端

```bash
git clone --branch backend --single-branch \
  https://github.com/tssai-lab/TSSAIPlatform.git TSSAIPlatform-backend
```

后端工程目录：

```text
TSSAIPlatform-backend/backend
```

### 获取前端

```bash
git clone --branch frontend-dev --single-branch \
  https://github.com/tssai-lab/TSSAIPlatform.git TSSAIPlatform-frontend
```

## 启动后端

### 环境要求

- JDK 17
- PostgreSQL
- MinIO
- Kubernetes（运行训练和推理任务时需要）

进入后端目录：

```bash
cd TSSAIPlatform-backend/backend
```

PowerShell 启动示例：

```powershell
$env:SPRING_DATASOURCE_URL="jdbc:postgresql://127.0.0.1:5432/tss"
$env:SPRING_DATASOURCE_USERNAME="postgres"
$env:SPRING_DATASOURCE_PASSWORD="请填写数据库密码"
$env:MINIO_ENDPOINT="http://127.0.0.1:9010"
$env:MINIO_ACCESS_KEY="请填写MinIO账号"
$env:MINIO_SECRET_KEY="请填写MinIO密码"

.\mvnw.cmd spring-boot:run
```

后端默认地址：

```text
http://127.0.0.1:8080
```

仅进行本地开发时，也可以使用 H2 `dev` profile：

```powershell
$env:MINIO_ACCESS_KEY="请填写MinIO账号"
$env:MINIO_SECRET_KEY="请填写MinIO密码"

.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
```

## 启动前端

### 环境要求

- Node.js 20 或更高版本
- npm 9 或更高版本

启动命令：

```bash
cd TSSAIPlatform-frontend
npm install
npm run dev:local
```

`dev:local` 会把前端 `/api` 请求转发到：

```text
http://127.0.0.1:8080
```

浏览器访问地址以前端终端实际输出为准。

生产构建：

```bash
npm run build
```

## 平台使用流程

### 1. 准备运行环境

管理员需要先准备 PostgreSQL、MinIO、Kubernetes、训练/推理 Worker 镜像和可用计算节点。

### 2. 上传训练输入

在平台中分别上传并创建版本：

1. 基础模型；
2. 训练数据集；
3. 训练代码。

模型、数据集和训练代码是三个独立资产。创建训练任务时再选择它们的具体版本进行组合，不需要预先放在同一个压缩包中。

### 3. 创建训练任务

进入“训练调度”，选择：

- 基础模型版本；
- 数据集版本；
- 已完成检查的训练代码版本；
- 与输入格式匹配的训练方案；
- epochs、batch、学习率等训练参数。

提交后，后端会创建 Kubernetes Job，并持续记录任务状态、进度、日志、指标和输出产物。

### 4. 发布训练模型

训练成功后，平台将符合训练方案要求的输出权重发布为新的模型版本。新版本应保留来源模型、数据集、训练代码、训练参数和训练任务等追溯信息。

### 5. 创建推理任务

进入“模型推理”，选择训练生成的新模型版本和推理输入，提交推理任务并查看状态、日志和结果。

完整流程如下：

```text
上传基础模型
  → 上传数据集
  → 上传训练代码
  → 创建训练任务
  → Kubernetes Worker 执行训练
  → 生成并发布新模型版本
  → 使用新模型执行推理
```

## 常用验证命令

后端构建：

```powershell
cd TSSAIPlatform-backend/backend
.\mvnw.cmd clean package -DskipTests
```

前端检查和构建：

```bash
cd TSSAIPlatform-frontend
npm run lint
npm run build
```

提交代码前，至少应保证自己修改的工程能够完成对应构建，并在 Pull Request 中说明测试方式和结果。
