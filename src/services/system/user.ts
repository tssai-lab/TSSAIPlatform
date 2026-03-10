// @ts-ignore
/* eslint-disable */
import { request } from '@umijs/max';

/** 当前用户角色，用于后端/ mock 按权限过滤数据 */
export type CurrentUserRoleForApi = 'super_admin' | 'normal_admin' | 'user';

// 查询用户列表请求参数
export interface UserListParams {
  pageNum?: number;
  pageSize?: number;
  username?: string;
  phone?: string;
  role?: string;
  status?: string;
  createTime?: string; // 单个日期，格式：YYYY-MM-DD
  /** 当前登录用户角色，普通管理员时仅返回普通用户列表 */
  currentUserRole?: CurrentUserRoleForApi;
}

// 查询用户列表响应
export interface UserListResponse {
  code: number;
  msg: string;
  data: {
    list: UserItem[];
    total: number;
  };
}

// 用户项（role 为展示名：超管 | 普通管理员 | 普通用户）
export interface UserItem {
  id: number;
  username: string;
  phone: string;
  role: string; // '超管' | '普通管理员' | '普通用户'
  status: string; // '启用' | '禁用'
  createTime: string; // YYYY-MM-DD
}

// 新增用户请求参数
export interface AddUserParams {
  username: string;
  phone: string;
  role: string;
  status: string;
}

// 编辑用户请求参数
export interface EditUserParams {
  id: number;
  username: string;
  phone: string;
  role: string;
  status: string;
}

// 通用响应
export interface CommonResponse {
  code: number;
  msg: string;
  data?: any;
}

// 模拟用户数据（用于开发环境）- 含超管、普通管理员、普通用户
const mockUsers: UserItem[] = [
  {
    id: 1,
    username: 'admin',
    phone: '13800138000',
    role: '超管',
    status: '启用',
    createTime: '2026-02-09',
  },
  {
    id: 2,
    username: 'manager1',
    phone: '13800138002',
    role: '普通管理员',
    status: '启用',
    createTime: '2026-02-08',
  },
  {
    id: 3,
    username: 'test01',
    phone: '13800138001',
    role: '普通用户',
    status: '启用',
    createTime: '2026-02-10',
  },
  {
    id: 4,
    username: 'test02',
    phone: '13800138003',
    role: '普通用户',
    status: '禁用',
    createTime: '2026-02-11',
  },
  {
    id: 5,
    username: 'zhangsan',
    phone: '13900139000',
    role: '普通用户',
    status: '启用',
    createTime: '2026-02-12',
  },
  {
    id: 6,
    username: 'lisi',
    phone: '13900139001',
    role: '普通用户',
    status: '启用',
    createTime: '2026-02-13',
  },
  {
    id: 7,
    username: 'wangwu',
    phone: '13900139002',
    role: '普通用户',
    status: '启用',
    createTime: '2026-02-14',
  },
  {
    id: 8,
    username: 'zhaoliu',
    phone: '13900139003',
    role: '普通用户',
    status: '禁用',
    createTime: '2026-02-15',
  },
  {
    id: 9,
    username: 'sunqi',
    phone: '13900139004',
    role: '普通用户',
    status: '启用',
    createTime: '2026-02-16',
  },
  {
    id: 10,
    username: 'zhouba',
    phone: '13900139005',
    role: '普通用户',
    status: '启用',
    createTime: '2026-02-17',
  },
  {
    id: 11,
    username: 'wujiu',
    phone: '13900139006',
    role: '普通用户',
    status: '启用',
    createTime: '2026-02-18',
  },
];

/** 管理员角色展示名（普通管理员视角下需隐藏这些账号） */
const ADMIN_ROLE_NAMES = ['超管', '普通管理员'];

// 是否使用模拟数据（开发环境使用，生产环境改为 false）
const USE_MOCK_DATA = process.env.NODE_ENV === 'development';

/** 查询用户列表 POST /api/system/user/list */
export async function getUserList(params: UserListParams) {
  // 开发环境使用模拟数据
  if (USE_MOCK_DATA) {
    return new Promise<UserListResponse>((resolve) => {
      setTimeout(() => {
        const { pageNum = 1, pageSize = 10, username, phone, role, status, createTime, currentUserRole } = params;

        // 过滤数据
        let filteredUsers = [...mockUsers];

        // 权限隔离：普通管理员仅能查看普通用户（不包含超管、普通管理员）
        if (currentUserRole === 'normal_admin') {
          filteredUsers = filteredUsers.filter((u) => !ADMIN_ROLE_NAMES.includes(u.role));
        }

        if (username) {
          filteredUsers = filteredUsers.filter((user) =>
            user.username.toLowerCase().includes(username.toLowerCase()),
          );
        }

        if (phone) {
          filteredUsers = filteredUsers.filter((user) => user.phone.includes(phone));
        }

        if (role) {
          filteredUsers = filteredUsers.filter((user) => user.role === role);
        }

        if (status) {
          filteredUsers = filteredUsers.filter((user) => user.status === status);
        }

        if (createTime) {
          filteredUsers = filteredUsers.filter((user) => {
            return user.createTime === createTime;
          });
        }

        // 分页
        const total = filteredUsers.length;
        const start = (pageNum - 1) * pageSize;
        const end = start + pageSize;
        const list = filteredUsers.slice(start, end);

        resolve({
          code: 200,
          msg: '查询成功',
          data: {
            list,
            total,
          },
        });
      }, 300); // 模拟网络延迟
    });
  }

  // 生产环境使用真实接口
  return request<UserListResponse>('/api/system/user/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: params,
  });
}

/** 新增用户 POST /api/system/user/add */
export async function addUser(params: AddUserParams) {
  // 开发环境使用模拟数据
  if (USE_MOCK_DATA) {
    return new Promise<CommonResponse>((resolve, reject) => {
      setTimeout(() => {
        const { username, phone, role, status } = params;

        // 检查用户名是否已存在
        const exists = mockUsers.some((user) => user.username === username);
        if (exists) {
          reject({
            response: {
              data: {
                code: 500,
                msg: '用户名已存在',
              },
            },
          });
          return;
        }

        // 创建新用户
        const newUser = {
          id: mockUsers.length + 1,
          username,
          phone,
          role,
          status,
          createTime: new Date().toISOString().split('T')[0],
        };

        mockUsers.push(newUser);

        resolve({
          code: 200,
          msg: '新增成功',
          data: newUser,
        });
      }, 300);
    });
  }

  // 生产环境使用真实接口
  return request<CommonResponse>('/api/system/user/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: params,
  });
}

/** 编辑用户 PUT /api/system/user/edit */
export async function editUser(params: EditUserParams) {
  // 开发环境使用模拟数据
  if (USE_MOCK_DATA) {
    return new Promise<CommonResponse>((resolve, reject) => {
      setTimeout(() => {
        const { id, username, phone, role, status } = params;

        const userIndex = mockUsers.findIndex((user) => user.id === id);
        if (userIndex === -1) {
          reject({
            response: {
              data: {
                code: 500,
                msg: '用户不存在',
              },
            },
          });
          return;
        }

        // 如果修改了用户名，检查新用户名是否与其他用户冲突
        if (username !== mockUsers[userIndex].username) {
          const exists = mockUsers.some((user) => user.id !== id && user.username === username);
          if (exists) {
            reject({
              response: {
                data: {
                  code: 500,
                  msg: '用户名已存在',
                },
              },
            });
            return;
          }
        }

        // 更新用户信息（包括用户名）
        mockUsers[userIndex] = {
          ...mockUsers[userIndex],
          username,
          phone,
          role,
          status,
        };

        resolve({
          code: 200,
          msg: '编辑成功',
          data: mockUsers[userIndex],
        });
      }, 300);
    });
  }

  // 生产环境使用真实接口
  return request<CommonResponse>('/api/system/user/edit', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    data: params,
  });
}

/** 删除用户 DELETE /api/system/user/delete */
export async function deleteUser(id: number) {
  // 开发环境使用模拟数据
  if (USE_MOCK_DATA) {
    return new Promise<CommonResponse>((resolve, reject) => {
      setTimeout(() => {
        const userIndex = mockUsers.findIndex((user) => user.id === id);
        if (userIndex === -1) {
          reject({
            response: {
              data: {
                code: 500,
                msg: '用户不存在',
              },
            },
          });
          return;
        }

        const deletedUser = mockUsers[userIndex];
        mockUsers.splice(userIndex, 1);

        resolve({
          code: 200,
          msg: '删除成功',
          data: deletedUser,
        });
      }, 300);
    });
  }

  // 生产环境使用真实接口
  return request<CommonResponse>(`/api/system/user/delete?id=${id}`, {
    method: 'DELETE',
  });
}

/** 禁用/启用用户 PUT /api/system/user/toggleStatus */
export async function toggleUserStatus(id: number, status: string) {
  // 开发环境使用模拟数据
  if (USE_MOCK_DATA) {
    return new Promise<CommonResponse>((resolve, reject) => {
      setTimeout(() => {
        const userIndex = mockUsers.findIndex((user) => user.id === id);
        if (userIndex === -1) {
          reject({
            response: {
              data: {
                code: 500,
                msg: '用户不存在',
              },
            },
          });
          return;
        }

        // 更新用户状态
        mockUsers[userIndex] = {
          ...mockUsers[userIndex],
          status,
        };

        resolve({
          code: 200,
          msg: `${status === '启用' ? '启用' : '禁用'}成功`,
          data: mockUsers[userIndex],
        });
      }, 300);
    });
  }

  // 生产环境使用真实接口
  return request<CommonResponse>('/api/system/user/toggleStatus', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { id, status },
  });
}

/** 校验用户名唯一性 POST /api/system/user/checkUsername */
export async function checkUsername(username: string) {
  // 开发环境使用模拟数据
  if (USE_MOCK_DATA) {
    return new Promise<CommonResponse>((resolve) => {
      setTimeout(() => {
        const exists = mockUsers.some((user) => user.username === username);
        resolve({
          code: 200,
          msg: exists ? '用户名已存在' : '用户名可用',
          data: {
            available: !exists,
          },
        });
      }, 200);
    });
  }

  // 生产环境使用真实接口
  return request<CommonResponse>('/api/system/user/checkUsername', {
    method: 'POST',
    skipErrorHandler: true, // 如果接口不存在，不显示错误
    headers: {
      'Content-Type': 'application/json',
    },
    data: { username },
  }).catch((error) => {
    // 如果接口不存在，返回一个模拟的响应
    // 实际项目中，如果后端没有这个接口，可以移除这个调用
    throw error;
  });
}

