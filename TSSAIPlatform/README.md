# AI 训练平台前端项目

基于 Ant Design Pro + UmiJS 构建的企业级前端应用。

## 环境要求

- **Node.js**: >= 20.0.0
- **npm**: >= 9.0.0 或 **yarn**: >= 1.22.0

## 快速开始

### 1. 克隆项目

```bash
git clone <项目地址>
cd myapp-simple
```

### 2. 安装依赖

```bash
npm install
```

或使用 yarn：

```bash
yarn install
```

### 3. 启动开发服务器

```bash
npm start
```

启动成功后，浏览器会自动打开 `http://localhost:8000`

如果端口被占用，会自动使用其他端口（查看终端输出）

### 4. 访问应用

- 默认地址：`http://localhost:8000`
- 默认会重定向到登录页：`/user/login`

### 5. 模型上传（需同时启动后端与 MinIO）

模型上传功能依赖 **Java 后端** 和 **MinIO**，文件会经后端写入 MinIO，并持久化到 MinIO 挂载目录（仓库根目录 `tss_minio_data`）。

1. **启动 MinIO**：确保 Docker 中已运行 MinIO 容器（API 端口 9010，如 `minio-tss`），并把容器 `/data` 挂载到仓库根目录 `tss_minio_data`。
2. **启动后端**（需 JDK 17+，无需单独安装 Maven）：
   ```bash
   cd backend
   .\mvnw.cmd spring-boot:run
   ```
   后端运行在 `http://127.0.0.1:8080`。
3. **启动前端**：在项目根目录执行 `npm start`，前端的 `/api` 会代理到 8080。
4. 在页面上进入「上传模型」，选择 zip 文件并填写信息提交即可。

详见 [backend/README.md](backend/README.md)。

## 常用命令

### 开发相关

```bash
# 启动开发服务器（默认）
npm start

# 启动开发服务器（无 mock）
npm run start:no-mock

# 启动开发服务器（开发环境）
npm run start:dev
```

### 构建相关

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

### 代码检查

```bash
# 检查代码风格
npm run lint

# 类型检查
npm run tsc
```

## 项目结构

```
myapp-simple/
├── config/              # 配置文件
│   ├── config.ts        # 主配置文件
│   ├── routes.ts        # 路由配置
│   └── defaultSettings.ts # 默认设置
├── src/
│   ├── pages/           # 页面组件
│   │   ├── user/        # 用户相关（登录、注册）
│   │   ├── model/       # 模型管理
│   │   ├── dataset/     # 数据集管理
│   │   ├── task/        # 训练任务
│   │   ├── system/      # 系统管理（管理员）
│   │   └── dashboard/   # 首页
│   ├── components/      # 公共组件
│   │   ├── JsonEditor/  # JSON编辑器
│   │   ├── ChartPanel/  # 图表组件
│   │   └── CodePreview/ # 代码预览
│   ├── services/        # API 服务
│   ├── locales/         # 国际化（目前只有中文）
│   ├── app.tsx          # 应用入口配置
│   └── access.ts        # 权限控制
└── public/              # 静态资源
```

## 功能模块

### 基础功能
- ✅ 用户登录/注册
- ✅ 权限管理（管理员/普通用户）
- ✅ 路由守卫

### 资产管理（M6 负责）
- 📝 模型列表、上传、详情
- 📝 数据集列表、上传

### 训练调度（M6 负责）
- 📝 发起训练
- 📝 任务列表
- 📝 训练结果详情

### 系统管理（M5 负责，仅管理员）
- 📝 用户管理
- 📝 审计日志
- 📝 API 文档

## 权限说明

- **普通用户**：可以访问模型管理、数据集管理、训练调度等功能
- **管理员**：除了普通用户权限外，还可以访问系统管理模块

权限判断依据：`currentUser.access === 'admin'` 或 `currentUser.role === 'admin'`

## 开发注意事项

1. **API 接口对接**：所有页面中的 `TODO` 注释标记了需要对接的接口
2. **类型定义**：API 相关类型定义在 `src/services/ant-design-pro/typings.d.ts` 和 `src/typings.d.ts`
3. **路由配置**：在 `config/routes.ts` 中配置
4. **全局状态**：通过 `useModel('@@initialState')` 访问

## 常见问题

### 1. 端口被占用

如果 8000 端口被占用，UmiJS 会自动使用其他端口，查看终端输出即可。

### 2. 依赖安装失败

```bash
# 清除缓存后重新安装
npm cache clean --force
rm -rf node_modules
npm install
```

### 3. 启动报错

- 确保 Node.js 版本 >= 20.0.0
- 确保已正确安装所有依赖
- 检查是否有语法错误

### 4. 登录后跳转问题

登录成功后会跳转到 `/dashboard`，如果未登录会自动跳转到登录页。

## 技术栈

- **框架**: UmiJS 4.x
- **UI 组件库**: Ant Design 5.x
- **Pro 组件**: @ant-design/pro-components
- **语言**: TypeScript
- **样式**: Less + antd-style

## 相关文档

- [UmiJS 文档](https://umijs.org/)
- [Ant Design Pro 文档](https://pro.ant.design/)
- [Ant Design 文档](https://ant.design/)

## 联系方式

如有问题，请联系项目负责人。
