# Flyway 迁移脚本说明

本目录存放模块二后端数据库的 Flyway 版本化迁移脚本。文件名形如
`V版本号__说明.sql`，Flyway 会按版本号顺序执行，并在数据库中记录每个脚本的
checksum。

注意：如果某个 `V*.sql` 已经在任一环境执行过，不建议再直接修改该 SQL 文件，
即使只是补注释也会改变 checksum，后续应用启动时可能触发 Flyway 校验失败。
需要补充说明时，优先维护本文档；确实要修改已执行脚本时，需要同步处理
Flyway repair 或重新基线化。

## 当前迁移总览

当前最高迁移版本为 `V29`。V1-V29 共同构成从空数据库升级到当前源码所需结构的
完整历史链路，均应保留。

| 版本 | 主要职责 | 当前定位 |
| --- | --- | --- |
| V1 | 模块二核心表 | 基础迁移 |
| V2 | 外键、唯一约束和值域约束 | 数据完整性 |
| V3 | 训练结果回调字段 | 训练模块结构 |
| V4 | 软删除和 MinIO 删除任务 | 通用基础能力 |
| V5 | 扩展点云和机器人任务类型 | 类型约束演进 |
| V6 | 训练实验 MLflow `run_id` | 训练模块结构 |
| V7 | 数据集 READY/DRAFT 版本体系 | 数据集版本生命周期 |
| V8 | 多模态样本、数据、标注和导入任务 | 多模态基础结构 |
| V9 | 导入恢复和清理查询索引 | 性能与恢复能力 |
| V10 | 数据包及版本包关联 | append 和来源追踪 |
| V11 | 初始上传与 append 上传用途 | append 上传流程 |
| V12 | `AUTO_DIRECTORY` 分组模式 | 自动生成导入计划 |
| V13 | 代码资产和训练方案字段 | profile 训练代码管理 |
| V14 | 代码版本准入状态 | 训练代码准入 |
| V15 | 训练实验 MLflow experiment 跟踪 | 训练实验追踪 |
| V16 | V2 ImportJob 错误字段 | V2 导入错误展示 |
| V17 | V2 模型上传会话字段 | V2 模型上传 |
| V18 | 单资产 active DRAFT 唯一约束 | 数据集版本一致性 |
| V19 | 模型版本生命周期字段 | 模型版本管理 |
| V20 | 推理模块结构 | 推理脚本和任务 |
| V21 | 数据集版本文件数和目录索引 | 数据集列表性能 |
| V22 | 后台调度锁 | 多实例定时任务互斥 |
| V23 | MinIO 删除任务失败重置计数 | 删除任务恢复 |
| V24 | DRAFT 资产 ID 唯一索引 | DRAFT 约束补强 |
| V25 | 上传会话 strictManifest 字段 | 多模态 MANIFEST 严格模式 |
| V26 | dataset workspace 审计日志 | 工作区内部回溯 |
| V27 | ImportJob PARTIAL 和失败样本表 | 增量 retry |
| V28 | 上传会话 DISCARDED 状态 | 草稿放弃与清理 |
| V29 | 代码工作区、校验、审批和审计结构 | 代码资产管理基础 |

部分旧约束会被后续迁移替换，但这不表示旧迁移可以删除：

- V5 扩展 V2 定义的任务类型约束。
- V8 再次扩展数据集相关类型约束，加入 `MULTIMODAL`；V5 对
  `model_asset.type` 的扩展仍然有效。
- V12 将 V8 中仅允许 `MANIFEST` 的 `sample_grouping` 约束扩展为同时允许
  `MANIFEST` 和 `AUTO_DIRECTORY`。

这些脚本已经形成有序迁移历史。对于可能已执行过迁移的数据库，不得删除、重命名、
调整版本号或修改已有 SQL 内容。需要变更数据库结构时，应新增下一个版本的迁移脚本。

## V1__module2_core_schema.sql

创建模块二核心业务表和基础索引。

- `model_asset`：模型资产表，保存模型名称、任务类型、备注、归属用户、创建/更新时间。
- `model_version`：模型版本表，保存版本号、原始文件名、MinIO 存储路径、文件大小、归属用户。
- `model_upload_session`：模型分片上传会话表，保存文件指纹、文件名、分片大小、总分片数、上传状态等。
- `model_upload_chunk`：模型分片记录表，保存每个分片在 MinIO 中的临时对象路径、大小、etag。
- `dataset_asset`：数据集资产表，保存数据集名称、数据集类型、CV 子任务、标注格式、备注、归属用户。
- `dataset_version`：数据集版本表，保存数据集版本号、原始文件名、MinIO 存储路径、大小、CV 元数据等。
- `dataset_upload_session`：数据集分片上传会话表，保存数据集名称、版本、任务类型、上传状态等。
- `dataset_upload_chunk`：数据集分片记录表，保存每个数据集分片的临时对象路径和大小。
- `training_experiment_version`：训练实验版本表，保存实验版本、模型版本、代码版本、数据集版本、超参数和状态。
- 创建上传指纹、上传状态、分片会话、训练实验 ID 等常用查询索引。

## V2__module2_constraints.sql

为 V1 创建的表补充唯一约束、外键约束和值域校验。

- 增加唯一索引，例如同一个模型/数据集资产下版本号唯一，上传分片 `(upload_id, part_index)` 唯一。
- 增加模型、数据集、上传会话、训练实验之间的外键关系。
- 限制模型资产和数据集资产的 `type` 取值。
- 限制 CV 子任务 `cv_task_type` 的允许值。
- 限制标注格式 `annotation_format` 的允许值。
- 限制模型/数据集上传会话状态只能是 `UPLOADING`、`COMPLETING`、`COMPLETED`。
- 限制训练实验状态只能是 `pending`、`queued`、`running`、`success`、`failed`、`stopped`。

## V3__training_result_callback_fields.sql

为训练实验版本表增加训练结果回写相关字段。

- 增加 `progress`：训练进度。
- 增加 `metrics_json`：训练指标 JSON。
- 增加 `log_path`：训练日志路径。
- 增加 `output_path`：训练输出路径。
- 增加 `error_message`：失败原因。
- 增加 `started_at`、`finished_at`：训练开始和结束时间。
- 对历史数据回填 `progress`：`success` 为 `100`，`running` 为 `50`，其他状态为 `0`。
- 增加 `progress` 校验，确保取值为空或位于 `0` 到 `100`。

## V4__soft_delete_and_minio_delete_task.sql

增加软删除能力和 MinIO 对象异步删除任务表。

- 为 `model_asset`、`model_version`、`dataset_asset`、`dataset_version` 增加 `deleted` 和 `deleted_at`。
- 为上述软删除字段增加索引，用于列表和详情接口过滤已删除数据。
- 创建 `minio_delete_task` 表，用来记录待删除、处理中、成功、失败的 MinIO 对象删除任务。
- 为删除任务的状态、对象路径、来源业务增加索引。
- 限制删除任务状态只能是 `PENDING`、`PROCESSING`、`SUCCESS`、`FAILED`。
- 限制重试次数不能为负，最大重试次数必须大于 0，且当前重试次数不能超过最大重试次数。

## V5__extend_task_types_point_cloud.sql

扩展任务类型约束，支持点云和机器人类型。

- 删除并重建 `model_asset.type` 的 check 约束，使模型资产类型允许 `CV`、`NLP`、`POINT_CLOUD`、`ROBOT`。
- 删除并重建 `dataset_asset.type` 的 check 约束，使数据集资产类型允许同样四种类型。
- 删除并重建 `dataset_upload_session.task_type` 的 check 约束，使数据集上传会话允许同样四种类型。
- 该迁移用于配合 Java 侧 `TaskType` 枚举扩展；否则后端即使允许 `POINT_CLOUD`，数据库仍会因为旧约束拒绝写入。

## V6__training_mlflow_run_id.sql

为训练实验版本增加 MLflow 运行标识。

- 为 `training_experiment_version` 增加 `run_id`。
- 用于关联训练实验版本和对应的 MLflow Run。

## V7__dataset_version_enterprise_versioning.sql

数据集版本管理企业化改造。

- 为 `dataset_version` 增加 `version_no`、`version_label`、`description`、`change_log`、`parent_version_id`、`status`、`file_fingerprint`、`published_at`、`created_by`。
- 为 `dataset_asset` 增加 `current_version_id`，用于标记当前推荐版本。
- 为历史数据按 `asset_id` 和创建时间回填连续 `version_no`，并将旧 `version` 回填为 `version_label`。
- 将历史版本状态回填为 `READY`，并将每个资产当前版本指向未删除且 `version_no` 最大的版本。
- 增加 `(asset_id, version_no)` 唯一索引、版本状态约束、父版本外键和当前版本外键。
- 为 `dataset_upload_session` 增加版本说明和父版本字段，支持上传过程中保留版本元数据。

## V8__multimodal_dataset_skeleton.sql

建立多模态数据集的样本级存储结构。

- 扩展 `dataset_asset.type` 和 `dataset_upload_session.task_type`，允许
  `MULTIMODAL`。
- 创建 `dataset_sample`，保存版本内样本、`external_id`、顺序、标签、元数据和
  软删除状态。
- 创建 `dataset_sample_data`，保存 IMAGE、TEXT、POINT_CLOUD、AUDIO、VIDEO 等
  样本数据及 ZIP entry 定位信息。
- 创建 `dataset_annotation`，保存标注文件以及与样本、样本数据的关联。
- 创建 `import_job`，记录异步导入状态、进度、样本数量、错误和心跳信息。
- 为 `dataset_upload_session` 增加 `sample_grouping`、`manifest_path`、
  `import_job_id` 和上传资产来源标识。
- 初始 `sample_grouping` 约束只允许 `MANIFEST`，后续由 V12 扩展。

## V9__multimodal_recovery_indexes.sql

为多模态导入恢复、上传会话扫描和软删除清理增加组合索引。

- `import_job(status, heartbeat_at)`：支持发现超时或待恢复的导入任务。
- `dataset_upload_session(status, updated_at)`：支持扫描未完成上传会话。
- `dataset_version(deleted, deleted_at)`：支持软删除版本的查询和清理。

该迁移主要改善恢复任务和后台扫描的查询性能，不新增业务字段。

## V10__dataset_package_model.sql

建立多模态 ZIP 数据包模型和版本引用关系。

- 创建 `dataset_package`，保存 ZIP 对象路径、文件名、大小、校验值、manifest
  路径和删除状态。
- 创建 `dataset_version_package`，记录版本使用的 PRIMARY、APPEND 数据包及顺序。
- 为 sample、sample data、annotation 增加来源 package 外键。
- 为 `import_job` 增加 `package_id`，允许一个数据集版本拥有多个导入任务。
- 使用部分唯一索引分别约束 package 导入任务和兼容旧流程的版本级导入任务。

## V11__dataset_append_package_upload.sql

区分初始数据集上传和 DRAFT append 数据包上传。

- 为 `dataset_upload_session` 增加 `upload_purpose`。
- 允许值为 `INITIAL_DATASET` 和 `APPEND_PACKAGE`。
- 增加上传用途索引，支持按上传流程查询会话。

## V12__multimodal_auto_directory_grouping.sql

扩展多模态样本分组模式。

- 删除 V8 创建的旧 `sample_grouping` check 约束。
- 新约束同时允许 `MANIFEST` 和 `AUTO_DIRECTORY`。
- `AUTO_DIRECTORY` 由后端根据 ZIP 目录结构生成内存中的导入计划，不要求用户上传
  `manifest.json`。

## V16__v2_import_job_errors.sql

为 V2 数据集接口补充结构化导入错误字段。

- 为 `import_job` 增加 `error_code`。
- 为 `import_job` 增加 `error_details_json`。
- 用于在保留原始 `error_message` 的同时，向 V2 门面提供稳定错误码和可选错误详情。

## V17__v2_model_upload_session.sql

为 V2 模型上传流程补充上传会话元数据。

- 增加 `target_asset_id`，支持向已有模型资产上传新版本。
- 增加 `model_name`、`model_version`、`task_type` 和 `remark`。
- 为 `target_asset_id` 增加指向 `model_asset` 的外键，模型资产删除时置空。

## V18__dataset_version_one_active_draft.sql

约束同一个数据集资产最多只能存在一个未删除的 DRAFT 版本。

- 为 `dataset_version(asset_id)` 增加部分唯一索引。
- 索引条件限定为 `status = 'DRAFT' AND deleted = false`，READY、DEPRECATED、
  ARCHIVED 以及已软删除版本不受影响。

## V21__dataset_version_file_count_and_catalog_indexes.sql

为数据集版本增加持久化文件数，并补充数据集列表查询索引。

- 为 `dataset_version` 增加 nullable `file_count`，旧版本可在首次列表命中时懒计算回填。
- 为 `dataset_asset` 增加 owner/type/deleted/time 维度列表索引，支持普通用户数据集列表分页。
- 为 `dataset_asset` 增加 admin/type/deleted/time 维度列表索引，支持管理员数据集列表分页。

## V25__dataset_upload_session_strict_manifest.sql

为 `dataset_upload_session` 增加 `strict_manifest`，默认 `false`。

- 仅 `MULTIMODAL + MANIFEST` 上传会话可保存为 `true`。
- `true` 时 ImportJob 会把 manifest 未声明的普通 ZIP entry 判定为结构化失败。
- `false` 保持既有兼容行为，未声明 entry 仍只进入 warnings。

## V26__dataset_workspace_audit_log.sql

为 dataset workspace 增加 append-only 审计日志表。

- 创建 `dataset_workspace_audit_log`。
- 记录关键操作、actor、目标对象、ImportJob/package/sample 关联和安全 `details`。
- 不记录 `storagePath`、bucket、MinIO objectName 或 ZIP offset。
- 审计日志仅用于模块二内部回溯，不参与 READY/DRAFT、publish、retry 或清理状态判断。

## V27__import_job_partial_retry.sql

为 ImportJob 增加 PARTIAL 状态和增量 retry 所需的失败样本明细。

- 重新创建 `ck_import_job_status`，允许 `PENDING`、`RUNNING`、`SUCCESS`、`FAILED`、`PARTIAL`、`SUPERSEDED`；其中 `SUPERSEDED` 继续保留在数据库约束内。
- 创建 `import_job_sample_failure`，记录失败样本的 `external_id`、原始 `sample_index`、失败状态、错误码、错误信息、重试次数和时间字段。
- failure row 状态限定为 `FAILED`、`RETRYING`、`RESOLVED`。
- 增量 retry 只依赖 failure row 中保存的 `external_id` 和 `sample_index`，避免重新解析顺序导致样本序号漂移。

## V28__dataset_upload_session_discarded_status.sql

扩展数据集上传会话状态约束，允许工作区放弃流程持久化 `DISCARDED`。

- 保留 `UPLOADING`、`COMPLETING`、`COMPLETED` 三个既有状态。
- 新增 `DISCARDED`，用于草稿放弃后阻止会话继续上传，同时保留会话审计链。

## V29__code_asset_workspace_validation_approval.sql

建立代码资产工作区、文件增量、校验、审批和审计持久化基础。

- 为 `code_asset` 增加用途、运行时、入口脚本、训练类型和乐观锁版本字段。
- 为 `code_version` 增加制品哈希、校验状态、策略版本和生命周期时间字段，并补充资产外键及状态约束。
- 创建 `code_workspace` 和 `code_workspace_file_delta`，通过部分唯一索引保证每个资产最多一个未删除的 OPEN 工作区。
- 创建 `code_validation_run`、`code_approval_record` 和 `code_asset_audit_log`，并通过 PostgreSQL trigger 拒绝审计日志 UPDATE/DELETE。
- 将历史 APPROVED 状态保存为 `LEGACY_APPROVAL_IMPORTED` 记录后重置为 PENDING，要求按新流程重新校验和审批。

## 维护规则

- 已执行的版本化迁移只读维护，不修改文件内容或 checksum。
- 新增迁移前先检查当前最大版本，并使用下一个可用版本号。
- 不通过删除旧迁移来“清理”被后续迁移替换的约束。
- 如果需要为全新部署压缩历史，应单独设计 baseline，并明确区分已有数据库和全新
  数据库；不能直接替换现有 V1-V28 链路。
- 应用使用 Hibernate `validate` 时，实体字段变化必须先有对应 Flyway 迁移。
