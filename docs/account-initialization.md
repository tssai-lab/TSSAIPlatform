# 账号初始化指南

适用分支：`demo`。更新日期：2026-10-23。以下以 Linux/macOS 终端为例，使用 Docker Compose v2 与宿主机 Python 3.10+。

## 1. 拉取代码后有什么账号

**新部署没有任何预置网页登录账号。** Git 只有源码和表结构，不包含线上账号数据库。`DATABASE_PASSWORD` 和 `STORAGE_PASSWORD` 分别用于数据库、对象存储，不是网页登录密码。

当前已有演示服务器的 `admin01` 属于该服务器自己的数据库，不能拿它登录新建的独立环境。线上密码没有放进 GitHub，也不在本文发布。

执行本文的初始化命令后，会创建以下账号：

| 用户名 | 角色 | 密码 |
| --- | --- | --- |
| `demo_root` | 超级管理员，角色 ID 1 | 初始化时生成，查看账号文件 |
| `demo_admin` | 管理员，角色 ID 2 | 初始化时生成，查看账号文件 |
| `demo_user` | 普通用户，角色 ID 3 | 初始化时生成，查看账号文件 |

每个账号密码独立随机生成，为 16 位字母数字；没有所有部署通用的固定密码。

## 2. 部署独立环境

```bash
git clone --branch demo --single-branch https://github.com/tssai-lab/TSSAIPlatform.git
cd TSSAIPlatform
```

Docker 构建需要访问 npm、Maven 及容器镜像仓库。部署需要为数据库、上传原件、解压结果预留空间；10 GB 是默认上传容量上限，不代表安装只需要 10 GB 磁盘。

在同一个终端设置两个基础服务密码。请保存到自己的密码管理器中，后续管理 Compose 也需要这些环境变量：

```bash
read -rsp '数据库密码：' DATABASE_PASSWORD; printf '\n'
export DATABASE_PASSWORD
read -rsp '对象存储密码（至少8位）：' STORAGE_PASSWORD; printf '\n'
export STORAGE_PASSWORD
# 默认端口为 8014，已占用时可设置其他端口。
export DEMO_PORT=8014
docker compose -f deploy/compose.yml up -d --build
docker compose -f deploy/compose.yml ps
docker compose -f deploy/compose.yml logs --tail=100 backend
```

首次构建及数据库迁移需要时间，容器显示运行中不保证后端已经就绪。确认日志无启动异常，再打开 `http://127.0.0.1:8014/#/user/login`。部署在其他机器时，将 `127.0.0.1` 换成该机器地址，并按环境放通对应端口。

## 3. 创建并校验账号

在仓库根目录、保持上面的环境变量可用时执行：

```bash
python3 deploy/init-demo-accounts.py
```

工具会使用正在运行的 `manual-label-api` 容器访问同一套 Compose 内部的注册/登录 API，由后端生成 BCrypt 密码哈希，再通过本套 PostgreSQL 设置角色，并重新登录校验角色。不会连接原线上服务器，不会修改原开发工程。

默认账号文件位于宿主机：

```text
~/.config/tss-demo/accounts.json
```

该文件权限为 `600`，只允许当前系统用户读写，且位于仓库外。使用你自己的终端查看密码：

```bash
cat "$HOME/.config/tss-demo/accounts.json"
```

结构如下，下面的文字是示意，不是可登录密码：

```json
{
  "demo_root": "初始化生成的密码",
  "demo_admin": "初始化生成的密码",
  "demo_user": "初始化生成的密码"
}
```

也可以在首次初始化时指定仓库之外的文件：

```bash
python3 deploy/init-demo-accounts.py --accounts-file "$HOME/.config/tss-demo/team-demo-accounts.json"
```

后续再次执行需使用同一文件。向同事分发相应账号密码即可；不要把账号文件加入 Git，也不要把它误认为数据库备份。

## 4. 重复执行与故障处理

- **中断后再次执行**：保留账号文件，用同一命令重试。已创建账号先验证密码；校验通过才设置预期角色，不重复注册、不改密码。
- **同名账号已存在但密码不匹配**：停止，不接管或重置这个账号。确认是否用错部署环境、账号文件，或账号密码是否已被人工修改。
- **账号文件不存在而数据库已有账号**：不能重新生成一组密码后期待登录旧账号。恢复原账号文件，或由超级管理员按平台流程重置密码并妥善记录。
- **容器尚未就绪、环境变量缺失**：先看 `docker compose -f deploy/compose.yml ps` 和后端日志，再运行工具。日志中不要公开贴出密码或令牌。
- **账号文件权限过宽**：执行 `chmod 600 "$HOME/.config/tss-demo/accounts.json"` 后重试。
- **初始化部分完成**：前面成功的账号会保留，不会删除数据库数据；再次执行完成剩余账号。

工具应在默认 `tss-demo` Compose 环境运行。更改 `COMPOSE_PROJECT_NAME` 或其他 Docker 上下文会改变目标实例，应保证启动与初始化时使用相同环境。

## 5. 其他账号与功能范围

用户也可以通过登录页“用户名注册”创建普通账号，不依赖短信；用户名 6–20 个字符，不能是手机号格式；密码为 6–16 位字母、数字或下划线。普通注册不能自行获取管理员权限。

默认 `SMS_PROVIDER=disabled`，不把短信登录、手机注册、短信找回密码作为本 Demo 的可用登录方式。超级管理员与管理员也不能直接读取其他用户的人工标注项目。

默认 Compose 未启用真实训练所需的 Kubernetes / MLflow；创建管理员并不等于这些外部服务已经配置完成。逐项核验见[部署验收清单](deployment-acceptance.md)。
