# seu4080 独立平台部署资产

本目录只保存 seu4080 的固定部署接口，不保存密码或运行时 `.env`。

- `compose.control.yml`：PostgreSQL、MinIO、MLflow、后端。
- `compose.frontend.yml`：独立前端及其到本机后端/MLflow 的代理。
- `deploy-backend-image.sh`：校验后端镜像标签、ID、摘要，更新并失败回滚。
- `deploy-frontend-image.sh`：校验前端镜像标签、ID、摘要，更新并失败回滚。
- `install-deploy-assets.sh`：一次性安装或升级上述固定文件，不重启服务。

正式启用顺序：先人工审查并安装这些资产，再合并工作流。GitHub Runner 不检出仓库，只能调用已安装的固定脚本。前后端部署共用 `.platform-deploy.lock`，不会同时修改 Compose。
