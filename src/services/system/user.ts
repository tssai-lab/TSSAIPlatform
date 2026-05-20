/**
 * 系统管理-用户管理模块 - Services 层
 * 封装用户管理相关接口，供 Page 层调用
 */
import { request } from '@umijs/max';
import { SYSTEM_STATUS, SYSTEM_ROLES } from '@/constants/systemLabels';
import { SYSTEM_API_CONFIG } from '@/constants/system';

/** 当前登录用户角色（用于后端按权限返回数据范围） */
export type CurrentUserRoleForApi = 'super_admin' | 'normal_admin' | 'user';

/** 查询用户列表请求参数 */
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

/** 查询用户列表响应 */
export interface UserListResponse {
  code: number;
  message: string;
  data: {
    list: UserItem[];
    total: number;
  };
}

/** 用户项（role 为展示名：超管 | 普通管理员 | 普通用户） */
export interface UserItem {
  id: number;
  username: string;
  phone: string;
  /** 所属部门（后端未返回时由页面兜底展示“默认部门”） */
  department?: string;
  role: string; // SystemRoleLabel（见 constants/systemLabels.ts）
  status: string; // SystemStatusLabel（见 constants/systemLabels.ts）
  createTime: string; // YYYY-MM-DD
}

/** 新增用户请求参数 */
export interface AddUserParams {
  username: string;
  phone: string;
  department?: string;
  role: string;
  status: string;
}

/** 编辑用户请求参数 */
export interface EditUserParams {
  id: number;
  username: string;
  phone: string;
  department?: string;
  role: string;
  status: string;
}

/** 通用响应结构 */
export interface CommonResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

function pickRoleLabel(roleId: unknown): string {
  const n = Number(roleId);
  if (n === 1) return SYSTEM_ROLES.SUPER_ADMIN;
  if (n === 2) return SYSTEM_ROLES.NORMAL_ADMIN;
  if (n === 3) return SYSTEM_ROLES.USER;
  return SYSTEM_ROLES.USER;
}

/** 拉取并筛选用户（不含分页，供列表与管理员列表复用） */
export async function fetchFilteredUserRows(
  params: UserListParams,
): Promise<{ code: number; message: string; rows: UserItem[] }> {
  const res = await request<{
    code?: number;
    message?: string;
    data?: { list: Record<string, unknown>[]; total: number };
  }>(SYSTEM_API_CONFIG.ENDPOINTS.USER_LIST, {
    method: 'GET',
  });

  if (res.code !== 200 || !res.data?.list || !Array.isArray(res.data.list)) {
    return {
      code: res.code ?? 500,
      message: (res as any).message ?? '查询失败',
      rows: [],
    };
  }

  let rows: UserItem[] = res.data.map((row) => {
    const id = Number(row.id);
    const username = String(row.username ?? '');
    const phone = String(row.mobile ?? row.phone ?? '');
    const roleId = row.role_id ?? row.roleId;
    const role = pickRoleLabel(roleId);
    const sb = row.status;
    const status =
      sb === true ||
      sb === 'true' ||
      sb === 't' ||
      sb === 1 ||
      sb === '1'
        ? SYSTEM_STATUS.ENABLED
        : SYSTEM_STATUS.DISABLED;
    const createdRaw = row.created_at ?? row.createdAt;
    let createTime = '';
    if (createdRaw != null) {
      const s = String(createdRaw);
      createTime = s.length >= 10 ? s.slice(0, 10) : s;
    }
    return {
      id,
      username,
      phone,
      department: '默认部门',
      role,
      status,
      createTime,
    };
  });

  if (params.currentUserRole === 'normal_admin') {
    rows = rows.filter((r) => r.role === SYSTEM_ROLES.USER);
  }

  const {
    username,
    phone,
    role,
    status,
    createTime,
    pageNum = 1,
    pageSize = 10,
  } = params;

  if (username) {
    rows = rows.filter((r) => r.username.includes(String(username)));
  }
  if (phone) {
    rows = rows.filter((r) => r.phone.includes(String(phone)));
  }
  if (role) {
    rows = rows.filter((r) => r.role === role);
  }
  if (status) {
    rows = rows.filter((r) => r.status === status);
  }
  if (createTime) {
    rows = rows.filter((r) => r.createTime === createTime);
  }

  const total = rows.length;
  const start = (pageNum - 1) * pageSize;
  const list = rows.slice(start, start + pageSize);

  return {
    code: 200,
    message: 'ok',
    data: { list, total },
  };
}

/** 新增用户 POST /api/system/user/add */
export async function addUser(params: AddUserParams) {
  return request<CommonResponse<UserItem>>(SYSTEM_API_CONFIG.ENDPOINTS.USER_ADD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: params,
  });
}

/** 编辑用户 PUT /api/system/user/edit */
export async function editUser(params: EditUserParams) {
  return request<CommonResponse<UserItem>>(SYSTEM_API_CONFIG.ENDPOINTS.USER_EDIT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: params,
  });
}

/** 删除用户 DELETE /api/system/user/delete */
export async function deleteUser(id: number) {
  return request<CommonResponse<UserItem>>(SYSTEM_API_CONFIG.ENDPOINTS.USER_DELETE, {
    method: 'DELETE',
    params: { id },
  });
}

/** 启用/禁用用户 PUT /api/system/user/toggleStatus */
export async function toggleUserStatus(id: number, status: string) {
  return request<CommonResponse<UserItem>>(SYSTEM_API_CONFIG.ENDPOINTS.USER_TOGGLE_STATUS, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: { id, status },
  });
}

/** 校验用户名唯一性 POST /api/system/user/checkUsername（由调用方自行处理错误提示） */
export async function checkUsername(username: string) {
  return request<CommonResponse<{ available: boolean }>>(SYSTEM_API_CONFIG.ENDPOINTS.USER_CHECK_USERNAME, {
    method: 'POST',
    skipErrorHandler: true,
    headers: { 'Content-Type': 'application/json' },
    data: { username },
  }).catch((error) => {
    throw error;
  });
}

