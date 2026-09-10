# 后端代码治理 SOP

## 本轮范围（2026-09-09）

独立分支 `codex/backend-code-governance`，基线 `2cac3f8`。不混入另一工作区的交付安装器改动，不推送 `backend`、`backend-ops` 或 `backend-gpu`，不部署。

### A：确认的事实

- `DatasetUploadService` 同时包含会话/版本事务、输入规则、目录 ZIP 和 MinIO SDK 操作，原文件约 2686 行。
- 原有完成流程是短事务占用 → 事务外存储/校验 → 短事务发布 → 失败补偿；对象存储与数据库不共享事务。三个合并对象代码块仅目标变量名称有差异，调用和参数构造相同。
- 原有条件更新、唯一约束、所有权校验及提交后清理已有并发/生命周期契约测试；必须保留。
- 已在重构前增加目录打包 5 项行为契约。内网机械盘隔离基线测试共 1364 项，1362 通过、2 跳过、0 失败；另明确排除 10 个依赖 Testcontainers 的套件，不能称为全量集成验收。

### B：采用的低风险方案

- 将无状态输入策略抽到 `DatasetUploadPolicy`，目录打包抽到 `DatasetFolderArchive`，重复 SDK 调用抽到 `DatasetUploadObjectStore`；均为包内小类，不新增 Spring Bean 或基础框架。
- 原公共入口及测试依赖的兼容入口保留。原类继续负责权限、事务、会话竞争、资源生命周期、失败补偿与审计；不得把这些职责拆散到隐式回调。
- SDK 包装不吞异常、不自动重试、不自行删除对象；流的关闭和临时文件清理由原调用方负责。

### C：本轮不擅自决定

不改数据库结构、权限、资产格式、状态机、重试规则、API 兼容性或跨环境部署策略。不能以文件缩短为理由重写所有上传编排；有业务风险的剩余工作另列。

## 阶段与验证

1. 基线和新增目录契约先运行，记录真实环境限制。
2. 机械搬移纯规则和目录打包；保留原调用次序；去重三个完全一致的对象合并调用。
3. 补 SDK 参数/顺序/异常不重试测试。运行重构后同一测试集合，对比基线；重点覆盖并发、重复完成、失败标记、权限拒绝、清理时序。
4. 独立第二遍检查 diff、构造器、事务注解、数据库/存储调用先后、无引用辅助方法；记录未验证项。
5. 单独提交、推送治理分支。测试通过不等于已部署或真实训练已验收。

## 内网测试保护范围

- 用户指定后端测试移至内网或外网，默认选择 seu5090，避免占用外网 CPU 验收集群。
- 独立路径 `/srv/tss-AIplatform/staging/fabric8-smoke/governance-20260909`，位于 `/dev/sda1` 机械盘；源码、Maven 缓存、临时文件和结果都放这里。
- `systemd-run --user --scope` 限制 CPU 100%（约 1 核）、总内存 2 GiB；Maven 与测试 JVM 各 768 MiB，串行。无 GPU、无真实业务数据库、无服务替换。
- 根盘 99%、可用约 15 GiB，Docker 仍在根盘。先不启动 Testcontainers；其专用镜像缺失，不允许测试偷偷拉取。没有删除或弱化原测试，只在本次命令显式排除并单列未验证。
- 基线包 SHA-256 `7482a8bb660508929c598f926e2a53baa23e089ab1cacd716502665722ad6176`；基线日志 `baseline-tests.log`。测试后根盘可用空间未出现可见变化。

## 执行记录

- G3 开始：前端 G2 已完成，提交 `3c1ccbc`；后端产品代码尚未修改，先形成以上约束。
- 机械抽取第一遍被审计保护阻止：目标变量一个叫 destName，另外两个叫 destinationObject；同时发现临时提取器把调用误认为声明。修正提取器并逐方法复查后重新生成，未部署或执行损坏代码。保留不同目标变量，不盲目统一业务变量。
- 基线两项跳过是 `Fabric8KubernetesRealClusterSmokeTest` 和 `Fabric8KubernetesRealGpuSmokeTest`，均需显式授权真实集群运行；本轮保持未启用。
- G3 实现完成：17 个方法迁入两个无状态辅助类，3 处对象合并由同一 SDK 适配器实现。原构造器签名、接口/DTO、数据库/迁移文件均未改。删除抽离后确无引用的私有 `extensionOf` 转发方法，真正的格式判断仍使用 `DatasetZipValidator`。
- 新增 9 个测试：目录契约 5 个（路径穿越、规范化碰撞、白名单、空文件、流异常关闭等）已纳入重构前基线；SDK 适配 4 个（分片顺序、对象目标、内容与长度、异常原样传播、不自动重试/清理）。原有测试未删除或修改。
- 重构后内网结果：1368 项中 **1366 通过、0 失败、2 显式真实集群测试跳过**；10 个容器套件仍未执行，与基线选择范围相同。`candidate-tests.log` 保存完整输出；耗时约 56 秒。
- 测试包 SHA-256 `ff1d7a3d0e79a2e2550b7b90b7ae4052b285755cd8aabde31d7f2f0cf5970107`，源码与本地候选一致；后续仅删除方法间冗余空白、补充文档。测试副本与独立缓存约 328 MiB，全部位于机械盘；未更新业务服务、镜像、配置和线上数据库。
- 第二遍反向审查：17 个迁移函数体与基线逐字一致（换行统一）；所有事务注解、事务调用与提交后清理入口顺序一致。五条有 SDK 替换的业务路径逐段对照：存储成功标记的位置、校验失败类别、对象目标、关闭流与失败补偿均保持原顺序。新适配器无数据库引用、无 catch、无重试、无删除操作。

## 预期行为—实现—测试

| 预期行为 | 实现责任 | 已执行证据 |
| --- | --- | --- |
| 正数文件大小先验证，分片数不超过原限制 | Service 入口 + Policy | 原 EnterpriseVersion / 分片测试 |
| 路径/格式不被抽离放宽 | Policy、FolderArchive、原 ZipValidator | 目录契约 5 项 + 原多模态/各格式测试 |
| 重复或并发上传不重复发布、失败可恢复 | 原 Service / Repository / RecoveryService | ChunkConcurrency、FailureLifecycle、ManifestCompletion、Recovery 系列通过；真实 PostgreSQL 竞争未在本轮重跑 |
| 存储调用保持对象和分片顺序 | ObjectStore，Service 控制调用次序 | 新 SDK 4 项 + 原上传失败/事务契约 |
| 权限、版本规则、提交后清理不变 | 原入口与事务编排 | 原相关服务/控制器测试，源码事务边界复核 |

## 维护入口及后续边界

- 新增输入校验先看 `DatasetUploadPolicy`；新增 ZIP/路径规则看 `DatasetFolderArchive` 和 `DatasetZipValidator`，不要复制第二套格式白名单。
- 新增 MinIO 参数处理看 `DatasetUploadObjectStore`；存储异常如何映射、何时标记失败、何时清理，仍看 `DatasetUploadService`。
- 修改会话状态、版本号竞争或清理顺序，必须同时运行 `DatasetUploadChunkConcurrencyTest`、`DatasetUploadFailureLifecycleTest` 及真实 PostgreSQL/MinIO 集成测试；Mockito 不能证明真实数据库锁和远端存储正确。
- 原编排仍较长；保留它是为了让占用、发布和补偿边界可见，不能在未补相应集成证据时继续拆成更多隐式流程。本轮完成已确认的职责分离，不宣称全仓库没有任何技术债。
- 上线建议：可以提交独立治理分支；**不建议凭本轮证据直接发布交付版**。先补 10 个容器套件，内网真实上传/草稿/发布/失败恢复冒烟，然后再合并部署。不要为跑测试连接业务数据库、重启共享 Docker 或自动占用 GPU。
- 其他存量告警：基线 Java 编译仍有弃用/泛型告警；GitHub 默认分支依赖告警不属于本次纯结构修改，需另做依赖风险评估，不能宣称已消除。

## G4：六项集中治理的后端部分（2026-09-09）

用户要求六项先完成修改，再统一测试。后端基线 `bab0447`，仍在 `codex/backend-code-governance`；不操作并行交付安装器工作区，不修改内外网部署分支或服务。前端同轮细节见其 `docs/six-issue-governance-sop.md`。

### 已确认规则与本轮改动

| 规则 | 实现与边界 | 验证 |
| --- | --- | --- |
| 上传校验沿用 `INVALID_UPLOAD_REQUEST`，资源校验沿用 `INVALID_REQUEST` | `DatasetWorkspaceResourcePolicy` 共用字段、枚举、边界、标注归属检查；调用方传入各自错误码 | 新 `SixIssueGovernanceTest`：空值、长度、负数、错误码差异、复制 Map、跨工作区/样本和已删除目标 |
| 工作区/样本归属必须先校验，原事务和写入顺序不变 | `V2DatasetWorkspaceResourceService`、`DatasetWorkspaceFileUploadService` 仍编排权限、事务、持久化和补偿；`DatasetWorkspaceResourceMapper` 只做 DTO 转换 | 原工作区资源、文件上传事务、发布与相关服务测试通过；新增拒绝场景不触发保存 |
| 导入计划到实体转换不能携带流程状态 | `ImportSampleMapper` 抽取原映射，ID、字段和 ZIP 路径处理保持 | 原 `ImportJobServiceTest`、单模态、目录及 Manifest 测试通过 |
| 错误分类不能依赖提示文案 | `ManifestFailureKind`、`ImportFailureMapper`；生产解析入口显式分类，旧异常构造器走独立 `LegacyImportFailureClassifier` | 新测试覆盖中文文案、误导关键词/用户路径、旧错误兼容、畸形 JSON、空单模态包；所有枚举类别验证 |
| 异常整理本身不能无限循环 | `ImportFailureMapper` 检查 cause 链已访问对象 | 新循环 cause 测试限时通过 |

新辅助类均为小范围职责提取，不增加数据库表、Spring 服务架构或公开接口字段。保留 `ManifestValidationException` 原构造器、错误码与 details 契约，只新增内部显式类别。Legacy 文本分类仍是历史兼容入口，不作为新错误产生路径的规范。

### 统一测试记录

- 测试位置：seu5090 `/srv/tss-AIplatform/staging/fabric8-smoke/six-issues-20260909`，项目机械盘 `/dev/sda1`，源码/临时文件/报告均在这里；复用机械盘离线 Maven 缓存。
- `systemd-run --user --scope` 限制 `CPUQuota=100%`、`MemoryMax=2G`、`TasksMax=256`；Maven 和测试 JVM 各 768 MiB。没有使用 GPU、连接业务数据库、拉取容器镜像、修改服务或重启服务器。
- 本轮新增 `SixIssueGovernanceTest` **8 项测试**；最终 Maven **1376 项，1374 通过、0 失败、0 错误、2 跳过**。完成于 `2026-09-09T16:11:11+08:00`，最终轮约 47 秒。
- 日志：测试目录 `backend-tests.log`，报告 `backend/target/surefire-reports`；`backend-round3.log` 是补充边界前的中间轮，最终以上述日志为准。
- 两项跳过仍为真实 Fabric8 CPU/GPU 集群冒烟；本轮没有冒充真实训练验收。
- 编译首次发现抽离 `toJson` 后遗漏静态导入，已补齐。第一次完整运行还发现隔离副本漏拷现有示例夹具导致 3 项失败，补齐夹具后重跑；没有删除或放宽测试断言。

以下 **10 个 Testcontainers 套件未执行**（命令中明确排除，并非通过或仅 2 项跳过的一部分）。原因：根盘 99%，Docker 所需镜像未齐，不允许测试自动拉取而挤占共享服务器空间。

```text
CodeAssetMinioContainerTest
CodeAssetPostgresContainerTest
CodeAssetPublishIntegrationTest
SaTokenRedisPersistenceContainerTest
DatasetWorkspaceUploadIntegrationTest
CatalogKeywordPostgresRepositoryTest
AssetNameAndAbandonedVersionPostgresRepositoryTest
DatasetUploadFailurePostgresRepositoryTest
DatasetCatalogReadinessPostgresContainerTest
DatasetWorkspaceMinioContainerTest
```

测试选择为 `-Dtest=*Test,!<上述各套件>`（每个套件分别排除），Maven 使用 `--offline --batch-mode --no-transfer-progress`；实际命令保存在本轮工作区根 `.cache/run-six-backend.sh`。此选择只用于本次隔离验证，不更改项目默认测试配置或 CI，不应复制为交付验收的默认全量测试命令。

### 反向审查、假设与上线边界

1. 在实现完成后的第二遍检查中，对照原函数体、调用顺序和错误码，确认映射/策略没有承担事务、写入、重试或清理职责；原 CAS、短事务、对象补偿和权限边界保留。
2. 复查各生产解析入口，补齐畸形 JSON、空单模态包等显式分类，并保留异常 cause；旧明确业务错误码仍优先透传。新增循环 cause 保护后再次执行最终测试集。
3. **假设：为保证兼容，不强制所有外部调用方立即更换异常构造器。** 依据是原测试与历史入口仍使用旧构造器。影响为保留单独 Legacy 分类器；新增生产错误必须显式指定类别，避免再扩展文本匹配。
4. **假设：本轮拆纯规则和映射，不继续拆事务编排。** 依据是现有 CAS/补偿与用户“不影响业务”。影响为部分 Service 仍较长，但关键状态顺序可见；不能把文件变短本身当成业务安全证据。
5. 最终测试后仅补文档及 Java 尾部空白整理，未再次改变业务逻辑。前端同期 208 项单测、setup/tsc/构建及 157 项本地浏览器断言通过，但都是独立回归证据，不能替代端到端验收。
6. 当前六项本轮范围已实现、未提交/推送/部署。建议先补齐独立 PostgreSQL/MinIO/Redis 集成环境，再做内网真实上传—发布—训练—结果读取回归，之后合并；**不建议直接替换正在验收的内外网服务**。不声明所有历史告警、长文件或技术债已清零。

## G5：接手保存与集成保护（2026-09-10，执行前登记）

- 用户授权先保存既有成果，再补关键集成、收拢内部契约与类型、逐模块拆职责和补中文维护说明；不推送、不部署、不修改并行安装包工作区。
- A：`bab0447` 上原 9 个修改文件、7 个新文件完整。1374 通过、2 跳过是 9 月 9 日的历史隔离结果，另 10 个容器套件未执行；本次保存不改变该证据边界。
- 先整体形成本地治理提交，再只读核对测试依赖和隔离条件。测试仅用独立容器及项目测试目录；不连接业务库、不占 GPU、不重启共享运行时、不自动拉镜像。条件不足记阻断，不把跳过算通过。
- B：在真实存储和数据库保护未通过前，保留事务/CAS/权限/补偿编排；可以补独立测试入口和纯规则的职责说明，不为缩短文件继续重构持久化链路。
- 每次后续实现先登记范围、可观察验收、资源与清理边界，完成后记录命令、版本、结果和第二遍反向审查。
