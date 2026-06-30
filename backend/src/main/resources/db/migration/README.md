# Flyway 迁移脚本说明

本目录存放模块二后端数据库的 Flyway 版本化迁移脚本。文件名形如
`V版本号__说明.sql`，Flyway 会按版本号顺序执行，并在数据库中记录每个脚本的
checksum。

注意：如果某个 `V*.sql` 已经在任一环境执行过，不建议再直接修改该 SQL 文件，
即使只是补注释也会改变 checksum，后续应用启动时可能触发 Flyway 校验失败。
需要补充说明时，优先维护本文档；确实要修改已执行脚本时，需要同步处理
Flyway repair 或重新基线化。

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

## V7__dataset_version_enterprise_versioning.sql

数据集版本管理企业化改造。
- 为 `dataset_version` 增加 `version_no`、`version_label`、`description`、`change_log`、`parent_version_id`、`status`、`file_fingerprint`、`published_at`、`created_by`。
- 为 `dataset_asset` 增加 `current_version_id`，用于标记当前推荐版本。
- 为历史数据按 `asset_id` 和创建时间回填连续 `version_no`，并将旧 `version` 回填为 `version_label`。
- 将历史版本状态回填为 `READY`，并将每个资产当前版本指向未删除且 `version_no` 最大的版本。
- 增加 `(asset_id, version_no)` 唯一索引、版本状态约束、父版本外键和当前版本外键。
- 为 `dataset_upload_session` 增加版本说明和父版本字段，支持上传过程中保留版本元数据。

## V21__dataset_version_file_count_and_catalog_indexes.sql

为数据集版本增加持久化文件数，并补充数据集列表查询索引。

- 为 `dataset_version` 增加 nullable `file_count`，旧版本可在首次列表命中时懒计算回填。
- 为 `dataset_asset` 增加 owner/type/deleted/time 维度列表索引，支持普通用户数据集列表分页。
- 为 `dataset_asset` 增加 admin/type/deleted/time 维度列表索引，支持管理员数据集列表分页。
