import { request } from '@umijs/max';
import type { PermissionTreeNode } from './typings';

export interface PermissionTreeResponse {
  code: number;
  msg: string;
  data: PermissionTreeNode[];
}

export interface RolePermissionResponse {
  code: number;
  msg: string;
  data: string[]; // 已选权限 id 列表
}

const USE_MOCK = process.env.NODE_ENV === 'development';

const mockPermissionTree: PermissionTreeNode[] = [
  {
    id: '1',
    name: '系统管理',
    type: 'menu',
    path: '/system',
    children: [
      { id: '1-1', name: '用户管理', type: 'menu', path: '/system/user' },
      { id: '1-2', name: '角色管理', type: 'menu', path: '/system/role' },
      { id: '1-3', name: '权限管理', type: 'menu', path: '/system/permission' },
      { id: '1-4', name: '日志管理', type: 'menu', path: '/system/log' },
      { id: '1-1-btn-add', name: '新增用户', type: 'button' },
      { id: '1-1-btn-edit', name: '编辑用户', type: 'button' },
      { id: '1-1-btn-delete', name: '删除用户', type: 'button' },
      { id: '1-4-btn-export', name: '导出日志', type: 'button' },
    ],
  },
  {
    id: '2',
    name: '个人中心',
    type: 'menu',
    path: '/account',
    children: [{ id: '2-1', name: '我的操作记录', type: 'menu', path: '/account/my-logs' }],
  },
];

export async function getPermissionTree(): Promise<PermissionTreeResponse> {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ code: 200, msg: 'ok', data: mockPermissionTree }), 200);
    });
  }
  return request<PermissionTreeResponse>('/api/system/permission/tree', { method: 'GET' });
}

export async function getRolePermission(roleId: number): Promise<RolePermissionResponse> {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          code: 200,
          msg: 'ok',
          data: roleId === 1 ? ['1', '1-1', '1-2', '1-3', '1-4', '1-1-btn-add', '1-1-btn-edit', '1-1-btn-delete', '1-4-btn-export', '2', '2-1'] : ['1', '1-1', '1-4', '2', '2-1'],
        });
      }, 200);
    });
  }
  return request<RolePermissionResponse>(`/api/system/permission/role/${roleId}`, { method: 'GET' });
}
