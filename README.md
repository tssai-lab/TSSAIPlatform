# TSS AI 平台 · Demo

本分支保存当前演示版完整源码：登录 → 平台选择 → 训练平台 / 数据标注平台。平台选择页只保留两个入口，标注平台使用东南大学校徽。

标注流程为新建项目、填写名称、从本机上传压缩包、手动标注、保存与导出。支持图像矩形框及分类、工业时序区间标注、分块上传和中断后继续上传；不包含模型自动标注或 Label Studio 集成。

## 交接文档与登录账号

新部署不包含线上账号数据库，不能直接用现有服务器的 `admin01` 登录。完整环境启动后运行：

```bash
python3 deploy/init-demo-accounts.py
```

会创建 `demo_root`（超级管理员）、`demo_admin`（管理员）、`demo_user`（普通用户），各自随机密码保存在仓库外的 `~/.config/tss-demo/accounts.json`，没有固定通用密码。

- [文档索引](docs/README.md)
- [Demo 需求文档](docs/demo-requirements.md)
- [账号初始化指南](docs/account-initialization.md)
- [部署验收清单](docs/deployment-acceptance.md)

源码构建和独立测试已通过；全新环境的整套 Compose 部署及浏览器流程仍须按验收清单实际核验，不能把源码检查通过当作完整部署验收。

## 目录

| 路径 | 内容 |
| --- | --- |
| `frontend/` | 登录、平台选择、训练平台及人工标注界面 |
| `backend/` | 现有 Spring Boot 登录与训练平台后端 |
| `server/` | 独立人工标注后端，Python 标准库 + SQLite |
| `deploy/` | 完整演示环境 Compose 与初始表结构 |
| `tests/` | 标注解析、压缩包、矩形框编辑与账号初始化验证 |
| `docs/` | 当前 Demo 的需求、账号、部署验收及文档索引 |

训练后端源自原 Trunk 提交 `10847f6`；前端源自独立演示工程并包含 2026-10-23 已上线的项目管理与弹窗样式修改。原自动化标注开发工程不在本分支内，未被覆盖或删除。

## 本地查看前端和标注功能

需要 Node.js 20+、Python 3.10+，以及一个可用的训练平台登录接口。以下命令复用当前演示服务器认证；上传文件及标注保存在本机 `server/data`。

```bash
cd frontend
npm ci
npm run tsc
npm run build
```

在两个终端分别启动：

```bash
cd server
LABEL_AUTH_URL=http://47.111.225.144:8001/api/user/current-user python3 app.py
```

```bash
cd frontend
HOST=127.0.0.1 PORT=8014 \
BACKEND_PROXY_TARGET=http://47.111.225.144:8001 \
LABEL_PROXY_TARGET=http://127.0.0.1:8013 \
node scripts/serve-dist.cjs
```

打开 `http://127.0.0.1:8014/#/user/login`，使用已有平台账号登录。

## 独立部署全部服务

需 Docker Compose。自行设置数据库、对象存储密码，再启动独立的演示环境：

```bash
export DATABASE_PASSWORD='自行设置数据库密码'
export STORAGE_PASSWORD='自行设置至少8位对象存储密码'
docker compose -f deploy/compose.yml up -d --build
```

默认入口 `http://127.0.0.1:8014/#/user/login`。新数据库没有预置账号，按上面的初始化命令创建三类演示账号；也可通过登录页注册普通账号。全栈 Compose 使用独立数据卷，不连接或替换现有线上容器。仅启动界面、资产管理与标注所需服务，GPU/Kubernetes 调度、短信及 MLflow 需按实际环境另行配置。

`server/compose.yml` 则用于把标注服务接入现有线上 `tss-trunk-8001_default` 网络，与全栈 Compose 二选一使用。

## 验证

```bash
npm --prefix frontend run tsc
npm --prefix frontend run build
node tests/data.cjs
node tests/archive.cjs
node tests/edit-mark.cjs
(cd server && python3 -m unittest test_app.py)
python3 -m unittest discover -s tests -p 'test_demo_accounts.py'
```

测试使用内存生成的小型数据，不需要真实数据集。测试认证服务仅在测试进程中运行，正式后端每次请求验证登录令牌和项目归属。

## 数据与限制

- 每次上传创建独立项目，项目名称与原文件名分别保存。
- 单次上传默认最大 10 GB，解压总量最大 20 GB，仍受可用磁盘限制；单块 8 MB。
- 项目列表显示最近 100 个项目；数据列表每页 50 个，按需读取当前文件。
- 单个时序文件最多 64 MB / 50000 个采样点；每个项目最多 20000 个可标注文件。
- 数据位于标注服务的 `/data` 持久卷（本机启动时为 `server/data`），包含 `index.sqlite`、上传原件和提取文件；标注结果导出不包含原文件。
- 仓库不包含用户数据集、线上数据库、账号凭据、依赖目录或构建产物。提交时只选择源文件，勿将运行数据加入 Git。

当前线上前端发布目录为 `/opt/tss-manual-label-projects-ui-20261023`，标注后端目录为 `/opt/tss-manual-label-service`。仓库中的 Compose 提供源码重建方式，不会自动发布到这些目录。
