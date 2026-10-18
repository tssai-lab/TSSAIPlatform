# TSSAIPlatform

后端功能修改入口、影响范围和必跑测试见[代码维护索引](backend/doc/代码维护索引.md)。执行证据和未验证范围见[代码治理 SOP](backend/doc/code-governance-sop.md)。

## 本地测试账号

拉取代码不会同步其他人的数据库。首次部署时，先按 [后端说明](backend/README.md) 配置 PostgreSQL、MinIO 等依赖并启动项目，再手动执行测试账号初始化脚本。

以下命令从本目录（`Trunk`）执行，适用于本地数据库容器名为 `tss-trunk-postgres`、数据库用户和库名均为 `tss` 的环境：

```bash
docker exec -i tss-trunk-postgres psql -v ON_ERROR_STOP=1 -U tss -d tss < backend/scripts/init-local-test-users.sql
```

其他环境请替换容器名、数据库用户名和库名。直接使用 PostgreSQL 客户端时：

```bash
psql -h 127.0.0.1 -p 5433 -U tss -d tss -v ON_ERROR_STOP=1 -f backend/scripts/init-local-test-users.sql
```

脚本要求事先完成 `backend/src/main/resources/db/module1-schema-postgresql.sql` 中的用户表和角色初始化；这是后端首次部署步骤的一部分。

| 角色 | 用户名 | 初始密码 |
| --- | --- | --- |
| 普通用户 | `user01` | `123456` |
| 普通用户 | `user02` | `123456` |
| 管理员 | `admin01` | `123456` |

脚本仅创建不存在的账号，可以重复执行；已有账号的密码、角色、禁用状态或删除状态均不变。因此已有同名账号时，仍需使用该账号原来的密码。

这些固定密码账号仅用于本地测试。脚本不会随应用启动自动执行，不要在正式数据库执行。
