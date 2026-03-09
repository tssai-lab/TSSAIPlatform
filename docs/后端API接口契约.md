# 后端 API 接口契约（登录/注册/系统管理）

> 本文档由前端代码自动梳理得到，来源包括：  \n+> `src/services/ant-design-pro/api.ts`、`src/services/ant-design-pro/login.ts`、`src/services/system/*.ts`。  \n+> **目的**：给后端提供“前端会怎么请求、前端期望怎么返回”的明确契约（请求体/响应体）。  \n+> **注意**：当前登录接口的返回结构仍沿用 Ant Design Pro demo 的 `status` 结构；其余大部分接口已按 `code/msg/data` 处理。

---

## 通用约定

### 1) Content-Type

- **JSON 请求**：`Content-Type: application/json`

### 2) 鉴权（建议约定）

- 对系统管理类接口建议使用：
  - `Authorization: Bearer <token>`
- 前端当前未统一注入请求头（后续可在 request 拦截器中补齐），但后端建议按标准鉴权实现。

### 3) 统一响应格式（推荐）

系统管理模块/注册/忘记/重置等页面，前端逻辑主要按以下格式设计：

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {}
}
```

### 4) 角色枚举（前端权限判断）

- `super_admin`：超级管理员（唯一）
- `normal_admin`：普通管理员（可多个）
- `user`：普通用户

---

## 一、登录 / 注册 / 认证相关接口

### 1. 获取当前用户

- **GET** `/api/currentUser`
- **请求参数**：无
- **响应体（前端使用字段）**：

```json
{
  "data": {
    "name": "admin",
    "userid": "admin",
    "avatar": "https://...",
    "phone": "13800138000",
    "role": "super_admin"
  }
}
```

> 说明：`role` 字段用于前端菜单/页面/按钮权限判断（`src/access.ts`）。

---

### 2. 账号密码登录

- **POST** `/api/login/account`
- **请求体**（来自 `API.LoginParams`，并额外传 `type`）：

```json
{
  "username": "admin",
  "password": "pass123456",
  "autoLogin": true,
  "type": "account"
}
```

- **响应体（当前前端按 demo 结构判成功：`status === 'ok'`）**：

```json
{
  "status": "ok",
  "type": "account",
  "currentAuthority": "admin"
}
```

> 若后端希望统一 `code/msg/data + token`，需要同步修改前端登录页的成功判断与 token 存储逻辑。

---

### 3. 退出登录

- **POST** `/api/login/outLogin`
- **请求体**：无
- **响应体**：前端未强约束，建议也采用统一格式：

```json
{
  "code": 200,
  "msg": "退出成功",
  "data": null
}
```

---

### 4. 发送验证码

- **POST** `/api/login/captcha`
- **请求体**：

```json
{
  "phone": "13800138000"
}
```

- **响应体（推荐与注册/重置流程统一）**：

```json
{
  "code": 200,
  "msg": "验证码发送成功",
  "data": {
    "captcha": "1234",
    "expireTime": 300
  }
}
```

---

### 5. 用户注册

- **POST** `/api/user/register`
- **请求体**：

```json
{
  "username": "test01",
  "password": "pass123456",
  "phone": "13800138000",
  "captcha": "1234"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "注册成功",
  "data": {
    "userId": "123456",
    "username": "test01",
    "phone": "13800138000"
  }
}
```

---

### 6. 忘记密码（发送验证码）

- **POST** `/api/user/forgotPassword`
- **请求体**：

```json
{
  "phone": "13800138000"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "验证码发送成功",
  "data": {
    "captcha": "1234",
    "expireTime": 300
  }
}
```

---

### 7. 重置密码

- **POST** `/api/user/resetPassword`
- **请求体**：

```json
{
  "phone": "13800138000",
  "captcha": "1234",
  "newPassword": "newpass123",
  "confirmPassword": "newpass123"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "重置成功",
  "data": null
}
```

---

## 二、系统管理模块接口

> 以下接口定义来自 `src/services/system/*`。开发环境当前用内置 mock 返回，但**生产环境将请求这些真实接口**。

---

## A. 用户管理（/api/system/user/*）

### A1. 查询用户列表（分页+筛选）

- **POST** `/api/system/user/list`
- **请求体**：

```json
{
  "pageNum": 1,
  "pageSize": 10,
  "username": "zhang",
  "phone": "138",
  "role": "普通用户",
  "status": "启用",
  "createTime": "2026-02-12",
  "currentUserRole": "normal_admin"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "查询成功",
  "data": {
    "list": [
      {
        "id": 3,
        "username": "test01",
        "phone": "13800138001",
        "role": "普通用户",
        "status": "启用",
        "createTime": "2026-02-10"
      }
    ],
    "total": 1
  }
}
```

#### 权限要求（业务规则）

- 超级管理员：可查看全部用户（含超管/普管/普通用户）
- 普通管理员：只能查看普通用户（管理员账号在任何地方不可见）
- 普通用户：无权限（建议 403）

---

### A2. 新增用户

- **POST** `/api/system/user/add`
- **请求体**：

```json
{
  "username": "newUser",
  "phone": "13800138009",
  "role": "普通用户",
  "status": "启用"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "新增成功",
  "data": {
    "id": 12,
    "username": "newUser",
    "phone": "13800138009",
    "role": "普通用户",
    "status": "启用",
    "createTime": "2026-03-09"
  }
}
```

---

### A3. 编辑用户

- **PUT** `/api/system/user/edit`
- **请求体**：

```json
{
  "id": 3,
  "username": "test01",
  "phone": "13800138001",
  "role": "普通用户",
  "status": "启用"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "编辑成功",
  "data": {
    "id": 3,
    "username": "test01",
    "phone": "13800138001",
    "role": "普通用户",
    "status": "启用",
    "createTime": "2026-02-10"
  }
}
```

---

### A4. 删除用户

- **DELETE** `/api/system/user/delete?id={id}`
- **请求参数**：query `id`
- **响应体**：

```json
{
  "code": 200,
  "msg": "删除成功",
  "data": {
    "id": 3
  }
}
```

---

### A5. 启用/禁用用户

- **PUT** `/api/system/user/toggleStatus`
- **请求体**：

```json
{
  "id": 3,
  "status": "禁用"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "禁用成功",
  "data": {
    "id": 3,
    "status": "禁用"
  }
}
```

---

### A6. 校验用户名唯一性

- **POST** `/api/system/user/checkUsername`
- **请求体**：

```json
{
  "username": "test01"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "用户名可用",
  "data": {
    "available": true
  }
}
```

---

## B. 日志管理（/api/system/log/*）

### B1. 查询日志列表（系统日志/操作日志）

- **GET** `/api/system/log/list`
- **请求参数（query）**：

```json
{
  "pageNum": 1,
  "pageSize": 10,
  "username": "test01",
  "operateType": "登录",
  "operateTime": ["2026-02-15 00:00:00", "2026-02-16 23:59:59"],
  "ip": "192.168",
  "result": "success",
  "logType": "operation",
  "currentUserRole": "normal_admin",
  "currentUsername": "test01",
  "content": "查询"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "查询成功",
  "data": {
    "list": [
      {
        "id": 11,
        "username": "test01",
        "operateType": "数据查询",
        "operateTime": "2026-02-16 09:15:22",
        "ip": "192.168.1.101",
        "content": "查询模型列表",
        "result": "success",
        "logType": "operation"
      }
    ],
    "total": 1
  }
}
```

#### 权限要求（业务规则）

- 超级管理员：可查看系统日志+操作日志；可查看管理员日志；可查看 IP
- 普通管理员：只能查看普通用户操作日志；管理员日志与系统日志不可见；IP 建议后端不返回或返回空
- 普通用户：无权限访问日志管理页（建议 403）；但“我的操作记录”仅能看自己（可用 `currentUsername` 限制）

---

### B2. 导出日志

- **GET** `/api/system/log/export`
- **请求参数**：同 B1（query）
- **响应体（前端会尝试打开 downloadUrl）**：

```json
{
  "code": 200,
  "msg": "导出成功",
  "data": {
    "count": 123,
    "downloadUrl": "https://example.com/download/audit_log_export.xlsx"
  }
}
```

---

## C. 角色管理（/api/system/role/*，仅超管）

### C1. 角色列表

- **POST** `/api/system/role/list`
- **请求体**：

```json
{
  "pageNum": 1,
  "pageSize": 10,
  "name": "管理员"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "查询成功",
  "data": {
    "list": [
      {
        "id": 2,
        "code": "normal_admin",
        "name": "普通管理员",
        "description": "仅管理普通用户",
        "userCount": 1,
        "createTime": "2026-02-02"
      }
    ],
    "total": 1
  }
}
```

---

### C2. 新增角色

- **POST** `/api/system/role/add`
- **请求体**：

```json
{
  "code": "ops",
  "name": "运营",
  "description": "运营角色"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "新增成功",
  "data": null
}
```

---

### C3. 编辑角色

- **PUT** `/api/system/role/edit`
- **请求体**：

```json
{
  "id": 3,
  "code": "user",
  "name": "普通用户",
  "description": "无系统管理权限"
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "编辑成功",
  "data": null
}
```

---

### C4. 删除角色

- **DELETE** `/api/system/role/delete?id={id}`
- **响应体**：

```json
{
  "code": 200,
  "msg": "删除成功",
  "data": null
}
```

---

### C5. 给角色分配权限

- **POST** `/api/system/role/assignPermission`
- **请求体**：

```json
{
  "roleId": 2,
  "permissionIds": ["1-1", "1-4-btn-export"]
}
```

- **响应体**：

```json
{
  "code": 200,
  "msg": "分配成功",
  "data": null
}
```

---

## D. 权限管理（/api/system/permission/*，仅超管）

### D1. 权限树

- **GET** `/api/system/permission/tree`
- **响应体**：

```json
{
  "code": 200,
  "msg": "ok",
  "data": [
    {
      "id": "1",
      "name": "系统管理",
      "type": "menu",
      "path": "/system",
      "children": [
        { "id": "1-1", "name": "用户管理", "type": "menu", "path": "/system/user" },
        { "id": "1-1-btn-add", "name": "新增用户", "type": "button" }
      ]
    }
  ]
}
```

---

### D2. 查询某角色已分配权限

- **GET** `/api/system/permission/role/{roleId}`
- **响应体**（权限 id 列表）：

```json
{
  "code": 200,
  "msg": "ok",
  "data": ["1", "1-1", "1-4-btn-export"]
}
```

---

## 附：当前未实现但 UI 暗示的接口

- 登录页 UI 存在“手机号登录”Tab，但当前代码**未实现** `POST /api/login/mobile` 的 service 与调用；因此未纳入以上契约。

