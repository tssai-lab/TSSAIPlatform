/**
 * 系统管理-用户管理模块 - Services 层
 * 封装用户管理相关接口，供 Page 层调用
 */
import { request } from '@umijs/max';
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

/** 查询用户列表 POST /api/system/user/list */
export async function fetchUserList(params: UserListParams) {
  return request<UserListResponse>(SYSTEM_API_CONFIG.ENDPOINTS.USER_LIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: params,
  });
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

