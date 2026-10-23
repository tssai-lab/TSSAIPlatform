# Demo 文档索引

适用分支：`demo`。更新日期：2026-10-23。

本分支是“登录 → 两个平台入口 → 训练平台 / 人工数据标注平台”的演示版本。下面四份文档是当前 Demo 的交接入口，旧技术文档用于定位代码，不代表旧文档中的所有计划都已实现。

| 建议阅读顺序 | 文档 | 解决的问题 |
| --- | --- | --- |
| 1 | [Demo 需求文档](demo-requirements.md) | 做什么、暂时不做什么、如何演示、有哪些限制 |
| 2 | [账号初始化指南](account-initialization.md) | 拉取部署、默认账号密码、既有账号更新及测试项目清理 |
| 3 | [部署验收清单](deployment-acceptance.md) | 新环境逐项检查、记录实际结果、区分已验证与待验证 |
| 4 | 本文档 | 代码、运行方法、历史技术资料的入口 |

## 默认登录账号

全新数据库首次启动自动创建账号，无需运行账号工具：

| 用户名 | 角色 | 密码 |
| --- | --- | --- |
| `admin01` | 管理员 | `123456` |
| `user01` | 普通用户 | `123456` |

已有数据库不会自动重置同名账号；既有服务器账号更新和两条测试项目定向清理的操作与验证记录见[账号初始化指南](account-initialization.md)。

## 运行与代码入口

| 内容 | 位置 |
| --- | --- |
| 项目总说明 | [README](../README.md) |
| 完整环境部署配置 | [deploy/compose.yml](../deploy/compose.yml) |
| 初始表和角色 | [deploy/database/01-users.sql](../deploy/database/01-users.sql) |
| 默认演示账号 SQL | [02-demo-accounts.sql](../deploy/database/02-demo-accounts.sql) |
| 登录与注册 | [登录页](../frontend/src/pages/user/login/index.tsx)、[注册页](../frontend/src/pages/user/register/index.tsx) |
| 平台选择 | [platforms](../frontend/src/pages/platforms/index.tsx) |
| 项目创建与压缩包上传 | [label-projects](../frontend/src/pages/label-projects/index.tsx) |
| 人工标注 | [manual-label](../frontend/src/pages/manual-label/index.tsx) |
| 标注后端与限制 | [server/README](../server/README.md)、[app.py](../server/app.py) |
| 训练与账号后端 | [backend/README](../backend/README.md)、[module1](../backend/src/main/java/com/tss/platform/module1) |
| 标注与账号测试 | [tests](../tests)、[后端上传测试](../server/test_app.py) |

## 技术参考

- 前端：[架构与扩展](../frontend/docs/前端架构与功能扩展指南.md)、[接口契约](../frontend/docs/接口契约与修改指南.md)、[维护索引](../frontend/docs/代码维护索引.md)。
- 后端：[技术设计](../backend/doc/technical-design.md)、[用户与权限](../backend/doc/module1-api-doc.md)、[训练计划](../backend/doc/training-plan-yaml-guide.md)、[训练调度与监控](../backend/doc/training-scheduling-resource-monitor.md)。
- 数据来源与许可：[SOURCES.txt](../frontend/public/demo-data/SOURCES.txt)。该文件为数据来源资料，不代表仓库附带数据集。

这些技术参考保留自训练平台基线，可能包含其他部署环境的端口、历史路径和阶段性计划。当前 Demo 的启动参数、账号及功能范围，以本目录和根 README 为准。

## 需求与调研材料的边界

当前需求来自项目负责人在本次演示开发中的明确调整：移除 AI 安全入口、保留训练平台、另建人工标注 Demo、上传本机压缩包、按项目保存、使用东南大学标识。需求文档据此整理，并与现有实现对照；它不是另做的市场调研报告。

现有数据资料主要涉及 VisA 工业图像与 TEP 工业时序。原自动化标注工程中的 Label Studio、模型自动标注规划属于另一条开发路线，未作为本分支已完成功能。未把真实数据集、账号数据库或线上密码复制到仓库。
