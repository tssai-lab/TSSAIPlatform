# 模型上传后端（Spring Boot + MinIO）

前端上传的模型文件经本服务接收后，写入 MinIO，并持久化到宿主机目录（如 Docker 挂载仓库根目录的 `.\tss_minio_data`）。

## 环境要求

- JDK 17+
- Maven 3.6+
- 已启动 MinIO 容器（如 `minio-tss`，API 端口 9010，数据目录挂载到仓库根目录 `tss_minio_data`）

## 配置

在 `src/main/resources/application.yml` 中已按你的 MinIO 配置好：

- **endpoint**: `http://127.0.0.1:9010`
- **access-key**: `admin`
- **secret-key**: `password123`
- **bucket**: `models`

如需修改，可改该文件或使用环境变量。

## 运行

**无需单独安装 Maven**，项目自带 Maven Wrapper，只需安装 **JDK 17+** 并配置 `JAVA_HOME`。

在 `backend` 目录下执行：

```bash
cd backend
.\mvnw.cmd spring-boot:run
```

首次运行会自动下载 Maven 和依赖（需联网）。服务启动在 **http://127.0.0.1:8080**。前端开发时通过代理访问：在项目根目录 `npm start` 后，前端的 `/api/*` 会转发到 8080。

若已安装 Maven，也可用：`mvn spring-boot:run`。

## 接口说明

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/model/upload/init` | POST | 初始化分片上传，返回 uploadId |
| `/api/model/upload/chunk` | POST | 上传单个分片 |
| `/api/model/upload/complete` | POST | 合并分片并写入 MinIO、落库 |
| `/api/model/list` | GET | 模型列表 |
| `/api/model/delete` | DELETE | 删除模型记录（params: id） |

## 数据流

1. 前端分片上传 → 本服务接收分片并写入 MinIO 临时对象。
2. complete 时本服务将分片合并为最终对象，路径：`models/{模型名}/{版本}/{文件名}`。
3. MinIO 将数据写入容器内 `/data`，因 Docker 挂载 `.\tss_minio_data:/data`，文件实际持久化在仓库根目录 **tss_minio_data**。

## 模型记录存储

当前使用内存存储（重启后列表清空）。生产环境可接入 MySQL 等，在 `ModelStoreService` 中改为数据库读写即可。
