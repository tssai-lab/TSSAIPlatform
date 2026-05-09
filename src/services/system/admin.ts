/**
 * 系统管理-管理员列表模块 - Services 层
 * 管理员列表基于用户管理接口复用实现（仅做管理员范围的约束）
 */
import type { CommonResponse, UserItem, UserListParams, UserListResponse } from './user';
import {
  addUser,
  checkUsername,
  deleteUser,
  editUser,
  fetchUserList,
  toggleUserStatus,
} from './user';
import { SYSTEM_ROLES } from '@/constants/systemLabels';

/** 管理员展示角色（与页面/后端约定保持一致） */
export const ADMIN_ROLE_NAMES = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.NORMAL_ADMIN] as const;
export type AdminRoleName = (typeof ADMIN_ROLE_NAMES)[number];

export type AdminItem = UserItem;
export type AdminListParams = UserListParams;
export type AdminListResponse = UserListResponse;

function assertAdminRole(role: string) {
  if (!ADMIN_ROLE_NAMES.includes(role as AdminRoleName)) {
    throw new Error('管理员角色不合法');
  }
}

/** 获取管理员列表（内部会过滤出管理员账号） */
export async function fetchAdminList(params: AdminListParams): Promise<AdminListResponse> {
  const res = await fetchUserList({
    ...params,
    // 强制按超管视角拉取（避免后端按 normal_admin 返回范围受限导致管理员列表不完整）
    currentUserRole: 'super_admin',
  });
  if (res.code !== 200) return res;

  const list = (res.data?.list ?? [])
    .filter((u) => ADMIN_ROLE_NAMES.includes(u.role as AdminRoleName))
    .map((u) => ({ ...u, department: u.department ?? '默认部门' }));
  return {
    ...res,
    data: {
      list,
      total: list.length,
    },
  };
}

/** 校验管理员用户名唯一性 */
export async function checkAdminUsername(username: string) {
  return checkUsername(username);
}

/** 新增管理员 */
export async function addAdmin(params: {
  username: string;
  phone: string;
  department?: string;
  role: AdminRoleName | string;
  status: string;
}): Promise<CommonResponse<UserItem>> {
  assertAdminRole(params.role);
  return addUser({
    username: params.username,
    phone: params.phone,
    department: params.department,
    role: params.role,
    status: params.status,
  });
}

/** 编辑管理员 */
export async function editAdmin(params: {
  id: number;
  username: string;
  phone: string;
  department?: string;
  role: AdminRoleName | string;
  status: string;
}): Promise<CommonResponse<UserItem>> {
  if (params.role !== SYSTEM_ROLES.USER) {
    assertAdminRole(params.role);
  }
  return editUser({
    id: params.id,
    username: params.username,
    phone: params.phone,
    department: params.department,
    role: params.role,
    status: params.status,
  });
}

/** 删除管理员 */
export async function deleteAdmin(id: number): Promise<CommonResponse<UserItem>> {
  return deleteUser(id);
}

/** 启用/禁用管理员 */
export async function toggleAdminStatus(id: number, status: string): Promise<CommonResponse<UserItem>> {
  return toggleUserStatus(id, status);
}

