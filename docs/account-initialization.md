# 账号初始化指南

适用分支：`demo`。更新日期：2026-10-23。以下以 Linux/macOS 终端、Docker Compose v2 为例。

## 1. 默认登录账号

全新数据库首次启动时自动创建两个账号，**无需运行账号工具**：

| 用户名 | 角色 | 密码 |
| --- | --- | --- |
| `admin01` | 管理员，角色 ID 2 | `123456` |
| `user01` | 普通用户，角色 ID 3 | `123456` |

`admin01` 是普通管理员，不是角色 ID 1 的超级管理员。两个账号的人工标注项目各自独立。

这些是 Demo 默认账号。SQL 中保存 BCrypt 密码哈希，不保存明文密码。数据库和对象存储密码是另外配置的服务密码，不是网页登录密码。

## 2. 拉取与部署

```bash
git clone --branch demo --single-branch https://github.com/tssai-lab/TSSAIPlatform.git
cd TSSAIPlatform
```

Docker 构建需要访问 npm、Maven 及容器镜像仓库。在同一个终端设置服务密码并启动：

```bash
read -rsp '数据库密码：' DATABASE_PASSWORD; printf '\n'
export DATABASE_PASSWORD
read -rsp '对象存储密码（至少8位）：' STORAGE_PASSWORD; printf '\n'
export STORAGE_PASSWORD
export DEMO_PORT=8014
docker compose -f deploy/compose.yml up -d --build
docker compose -f deploy/compose.yml ps
docker compose -f deploy/compose.yml logs --tail=100 backend
```

保存好自行设置的服务密码，后续 Compose 操作仍需要这些环境变量。首次构建与数据库迁移需要时间，后端启动完成后访问：

```text
http://127.0.0.1:8014/#/user/login
```

选择用户名密码登录，使用 `admin01 / 123456` 或 `user01 / 123456`。部署到其他机器时将地址替换为该机器地址；端口已占用时修改 `DEMO_PORT`。

## 3. 自动创建的工作方式

Compose 将以下 SQL 挂载到 PostgreSQL 的初始化目录：

1. [01-users.sql](../deploy/database/01-users.sql)：创建账号相关表和角色。
2. [02-demo-accounts.sql](../deploy/database/02-demo-accounts.sql)：创建两个默认账号。

PostgreSQL 只在**数据卷为空的首次启动**时自动执行这些文件。普通重启、`git pull` 或重新构建镜像不会把已有账号密码改成默认值。

默认账号 SQL 使用 `ON CONFLICT (username) DO NOTHING`，已有同名账号的密码、角色和状态保持不变。

## 4. 已经部署过的环境

`02-demo-accounts.sql` 只补充缺少的账号，不会覆盖已有账号。若需将既有 Demo 中的 `admin01`、`user01` 统一为上表角色和密码，先确认 Compose 当前指向目标 Demo，并备份 PostgreSQL；然后在仓库根目录执行以下定向更新。命令只更新两个未软删除的同名账号，且必须恰好更新两行，否则事务会失败：

```bash
docker compose -f deploy/compose.yml exec -T postgres \
  psql -X -v ON_ERROR_STOP=1 -U tss -d tss <<'SQL'
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE users
    SET role_id = CASE username WHEN 'admin01' THEN 2 WHEN 'user01' THEN 3 END,
        password = CASE username
            WHEN 'admin01' THEN '$2a$10$2tqH40CEfpKBp42Lex.MdOIjxPui89MB9aKWv6f1hrtPNc6R8nF4a'
            WHEN 'user01' THEN '$2a$10$FL3YVDeE.xnh2RTKaP8cg.3XfxRLnJ5pT.Zw0aH8jV9GS8TCCLQvi'
        END,
        status = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE username IN ('admin01', 'user01') AND deleted_at IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 active demo accounts; updated %', updated_count;
    END IF;
END $$;
SQL
```

成功后核对用户名、角色 ID、启用状态，并分别用 `admin01 / 123456`、`user01 / 123456` 实际登录验证。角色 ID 2 是管理员、ID 3 是普通用户；不要将 `admin01` 设为角色 ID 1 的超级管理员。若命令报错或更新行数不是 2，先检查账号是否缺失或已软删除，不要删数据库卷，也不要放宽更新条件。

现有演示服务器已于 2026-10-23 按上述角色和密码完成更新；两个账号均已通过网页登录验证。更新前数据库备份位于服务器 `/opt/tss-demo-backups/postgres-before-demo-account-reset-20261023.dump`。

## 5. 既有服务器演示项目清理

现有演示服务器的两条测试项目已于 2026-10-23 按项目 ID 定向删除：项目名称分别为 `项目上传部署验证` 和 `deployment-check.csv`，上传文件名均为 `deployment-check.csv`。核对确认仅删除两条项目记录、两个关联资产及其专属目录；项目列表和磁盘目录均已验证不存在。删除前的数据卷备份位于服务器 `/opt/tss-demo-backups/manual-label-before-test-project-cleanup-20261023.tar.gz`。

后续执行同类清理时，应先备份标注服务数据卷；通过 SQLite 项目表核对项目名称、上传文件名及项目 ID，确认目标恰好是指定记录后，只删除对应项目及其关联文件。不要按文件名直接清空目录、删除整个数据卷或清理其他用户项目。

## 6. 故障检查

- **登录失败**：先区分是否为全新数据卷；旧库同名账号不会被覆盖，再确认后端已完成启动。
- **提示缺少环境变量**：重新在当前终端设置原 `DATABASE_PASSWORD` 和 `STORAGE_PASSWORD`。
- **默认账号不存在**：确认空库初始日志执行了两个 SQL，或按第 4 节检查既有账号。
- **能登录但部分管理功能不可见**：`admin01` 是角色 ID 2 的管理员，超级管理员专属能力不在其权限内。
- **短信验证码不可用**：默认 `SMS_PROVIDER=disabled`，请使用用户名密码登录。

可以通过登录页用户名注册创建其他普通账号。用户名 6–20 个字符，不能是手机号格式；密码为 6–16 位字母、数字或下划线。

默认 Compose 未启用真实训练所需的 Kubernetes / MLflow，账号可登录不代表计算资源已配置。按[部署验收清单](deployment-acceptance.md)完成目标环境核验。
