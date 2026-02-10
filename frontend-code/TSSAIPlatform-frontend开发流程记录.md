# TSSAIPlatform-frontend 开发流程记录

本文档记录 **TSSAIPlatform-frontend** 项目的日常开发流程与关键步骤，便于个人与协作时按流程执行。详细说明见 [M6开发流程说明.md](./M6开发流程说明.md)。

---

## 一、环境与运行

### 1.1 环境要求

| 项     | 要求              |
|--------|-------------------|
| Node.js | >= 20.0.0（推荐 20.x LTS） |
| npm   | >= 9.0.0          |
| 系统   | Windows / macOS / Linux |

```bash
node --version   # 需 >= 20.0.0
npm --version
```

### 1.2 首次/重新安装与启动

```bash
# 1. 进入项目
cd TSSAIPlatform-frontend

# 2. 安装依赖（推荐国内镜像）
npm install --registry=https://registry.npmmirror.com

# 3. 启动开发
npm run start:dev
# 或
npm start
# 或
./start.sh
```

- 访问：`http://localhost:8000`（端口占用时见终端输出）
- 安装失败或超时：见 M6开发流程说明 →「常见问题与解决方案」及「项目运行过程记录」

---

## 二、日常开发流程

### 2.1 单次开发循环

1. **拉取/更新代码**  
   `git pull`（或按团队规范切分支）

2. **安装/更新依赖**（有 `package.json` 变更时）  
   `npm install --registry=https://registry.npmmirror.com`

3. **启动本地**  
   `npm run start:dev`，浏览器访问并自测

4. **开发与自测**  
   - 按「三、页面与功能开发步骤」做页面/接口/组件  
   - 在浏览器和控制台做基本功能与报错检查

5. **代码检查**  
   ```bash
   npm run lint      # 若有配置
   npm run tsc       # 类型检查（若有）
   ```

6. **提交**  
   - 按团队规范写 commit（如 conventional commits）  
   - `git add` → `git commit` → `git push`（或提 MR/PR）

### 2.2 开发前可确认的事项

- [ ] Node 版本 >= 20.0.0
- [ ] 依赖已安装且能正常启动
- [ ] 当前负责的页面/接口范围清楚（见 M6 任务范围）
- [ ] 常量与接口基础路径使用 `src/constants/platform.ts`、`src/services/platform.ts`（与原型设计一致）

---

## 三、页面与功能开发步骤

### 3.1 与原型/设计对齐

- 原型项目：**TSSAIPlatform-frontend-prototype**（已集成到本仓库）
- 常量与接口：`src/constants/platform.ts`、`src/services/platform.ts`
- 发起训练页：三步（选择/上传模型 → 选择/上传数据集 → 配置参数），参数支持「表单填写」（按 CV/NLP 区分）或「上传训练代码」

### 3.2 新增/修改页面时

1. **路由**  
   在 `config/routes.ts` 中配置 path、name、component、是否菜单展示等。

2. **页面组件**  
   在 `src/pages/` 下对应模块新建或修改页面（如 `model/list`、`task/create`）。

3. **类型**  
   在 `src/typings.d.ts` 的 `API` 命名空间中补充/修改类型（如 `ModelItem`、`TaskItem`）。

4. **接口**  
   - 通用业务接口放在 `src/services/platform.ts`，路径使用 `API_CONFIG.ENDPOINTS`
   - 与登录/用户相关的可放在 `src/services/ant-design-pro/api.ts`

5. **常量**  
   平台相关常量（API、上传限制、类型枚举等）放在 `src/constants/platform.ts`，避免硬编码。

### 3.3 当前 M6 负责页面一览

| 模块     | 页面           | 路径               | 说明                     |
|----------|----------------|--------------------|--------------------------|
| 模型管理 | 模型列表       | `/model/list`      | 列表、搜索、删除、详情   |
|          | 上传模型       | `/model/upload`    | 名称、版本、类型、备注、文件 |
|          | 模型详情       | `/model/detail/:id`| 基本信息、元数据、版本   |
| 数据集   | 数据集列表     | `/dataset/list`    | 列表、搜索、删除         |
|          | 上传数据集     | `/dataset/upload`  | 名称、文件（不要求类型） |
| 训练调度 | 发起训练       | `/task/create`     | 三步 + 表单/上传训练代码 |
|          | 任务列表       | `/task/list`       | 列表、状态、终止、删除   |
|          | 训练结果详情   | `/task/detail/:id` | 任务信息、指标、结果文件 |

---

## 四、重要节点与变更记录

### 4.1 原型集成（约 2026-01-25）

- 将 **TSSAIPlatform-frontend-prototype** 设计集成到主项目。
- 新增 `src/constants/platform.ts`（API、上传、类型、分页等常量）。
- 新增 `src/services/platform.ts`（模型/数据集列表、任务创建等）。
- 重写 `src/pages/task/create/index.tsx`：三步、选择/上传模型与数据集、参数「表单填写」或「上传训练代码」。
- 模型上传：支持 `.pt/.pth/.onnx/.pb` 等，备注必填；数据集上传：不再强制选择类型。
- 详情见 M6开发流程说明 →「原型集成说明」。

### 4.2 项目运行与依赖

- 依赖安装：推荐 `npm install --registry=https://registry.npmmirror.com`，必要时 `--timeout=60000`。
- Node 建议 >= 20.0.0；若使用 18.x，参考 M6开发流程说明中的「Node.js 版本不匹配」与升级说明。
- 快速启动脚本：`./start.sh`（检查依赖并启动开发服务）。

### 4.3 项目修改记录（TSSAIPlatform-frontend）

**说明**：对 TSSAIPlatform-frontend 的每次功能/页面/配置修改均应在此记录，便于追溯与协作。

| 日期 | 修改内容 | 涉及文件/模块 |
|------|----------|----------------|
| 2026-01-25 | 原型集成：常量、服务、发起训练页三步流程，模型/数据集上传与原型对齐 | `src/constants/platform.ts`、`src/services/platform.ts`、`src/pages/task/create/index.tsx`、`model/upload`、`dataset/upload` |
| 2026-01-31 | 原型页面体现：新增 Mock 数据，模型/数据集/任务列表及详情页使用 Mock，标题与操作与原型一致 | `src/constants/mockData.ts`、`model/list`、`model/detail/[id]`、`dataset/list`、`task/list`、`task/detail/[id]`、`task/create`（列表回退 Mock） |
| 2026-01-31 | 发起训练页增加「任务名称」：必填，顶部输入框，提交时随请求提交（表单/上传训练代码两种模式均包含） | `src/pages/task/create/index.tsx` |
| 2026-01-31 | 模型上传支持 .zip：千问等大模型由多文件组成，需打包为 zip 后上传；常量、模型上传页、发起训练页快速上传均支持 .zip 并更新提示文案 | `src/constants/platform.ts`、`src/pages/model/upload/index.tsx`、`src/pages/task/create/index.tsx` |
| 2026-02-01 | 发起训练页「配置参数」按模型类型区分：CV 显示 epochs(100–300)、batch、imgsz、lr0、optimizer(SGD)；NLP 显示训练基础配置(num_epochs、batch_size、learning_rate、max_seq_length)与 LoRA 配置(lora_r、lora_dropout)；均保留高级参数(JSON 可选) | `src/pages/task/create/index.tsx` |

### 4.4 后续可做（可勾选记录）

- [ ] 模型/数据集列表请求统一走 `src/services/platform.ts` 与 `API_CONFIG`。
- [ ] 模型/数据集上传与后端联调（分片、进度、错误处理）。
- [ ] 任务创建接口按「表单参数」与「上传训练代码」两种方式分别对接。
- [ ] 训练结果详情页：指标图表、结果文件列表与下载。
- [ ] 各列表页的删除、下载等与后端接口打通。

**文档约定**：今后对 TSSAIPlatform-frontend 的修改（新功能、页面调整、配置变更等）请同步在「4.3 项目修改记录」中新增一行，并更新本说明文档相关章节（若有）。

---

## 五、参考文档

| 文档                     | 用途说明                           |
|--------------------------|------------------------------------|
| [M6开发流程说明.md](./M6开发流程说明.md) | 项目概述、环境、详细步骤、规范、API、常见问题 |
| [README.md](./README.md) | 项目简介与快速开始                 |
| [config/routes.ts](./config/routes.ts) | 路由配置                          |

---

**维护说明**：本文档以「流程记录」为主，有新环境要求、新流程或重要节点时，在对应章节或「四、重要节点与变更记录」中补充即可；详细规范与说明仍以 M6开发流程说明.md 为准。
