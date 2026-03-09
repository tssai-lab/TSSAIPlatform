import { request } from '@umijs/max';
import type { RoleItem } from './typings';

export interface RoleListParams {
  pageNum?: number;
  pageSize?: number;
  name?: string;
}

export interface RoleListResponse {
  code: number;
  msg: string;
  data: { list: RoleItem[]; total: number };
}

export interface AddRoleParams {
  code: string;
  name: string;
  description?: string;
}

export interface EditRoleParams {
  id: number;
  code: string;
  name: string;
  description?: string;
}

export interface AssignPermissionParams {
  roleId: number;
  permissionIds: string[];
}

const USE_MOCK = process.env.NODE_ENV === 'development';

const mockRoles: RoleItem[] = [
  { id: 1, code: 'super_admin', name: '超级管理员', description: '系统最高权限', userCount: 1, createTime: '2026-02-01' },
  { id: 2, code: 'normal_admin', name: '普通管理员', description: '仅管理普通用户', userCount: 1, createTime: '2026-02-02' },
  { id: 3, code: 'user', name: '普通用户', description: '无系统管理权限', userCount: 8, createTime: '2026-02-03' },
];

export async function getRoleList(params: RoleListParams): Promise<RoleListResponse> {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const { pageNum = 1, pageSize = 10, name } = params;
        let list = [...mockRoles];
        if (name) {
          list = list.filter((r) => r.name.includes(name));
        }
        const total = list.length;
        const start = (pageNum - 1) * pageSize;
        list = list.slice(start, start + pageSize);
        resolve({ code: 200, msg: '查询成功', data: { list, total } });
      }, 200);
    });
  }
  return request<RoleListResponse>('/api/system/role/list', { method: 'POST', data: params });
}

export async function addRole(params: AddRoleParams): Promise<{ code: number; msg: string }> {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        mockRoles.push({
          id: mockRoles.length + 1,
          code: params.code,
          name: params.name,
          description: params.description,
          userCount: 0,
          createTime: new Date().toISOString().slice(0, 10),
        });
        resolve({ code: 200, msg: '新增成功' });
      }, 200);
    });
  }
  return request('/api/system/role/add', { method: 'POST', data: params });
}

export async function editRole(params: EditRoleParams): Promise<{ code: number; msg: string }> {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const i = mockRoles.findIndex((r) => r.id === params.id);
        if (i >= 0) {
          mockRoles[i] = { ...mockRoles[i], ...params };
        }
        resolve({ code: 200, msg: '编辑成功' });
      }, 200);
    });
  }
  return request('/api/system/role/edit', { method: 'PUT', data: params });
}

export async function deleteRole(id: number): Promise<{ code: number; msg: string }> {
  if (USE_MOCK) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const i = mockRoles.findIndex((r) => r.id === id);
        if (i < 0) {
          reject({ response: { data: { msg: '角色不存在' } } });
          return;
        }
        if (mockRoles[i].code === 'super_admin' || mockRoles[i].code === 'normal_admin') {
          reject({ response: { data: { msg: '系统内置角色不可删除' } } });
          return;
        }
        mockRoles.splice(i, 1);
        resolve({ code: 200, msg: '删除成功' });
      }, 200);
    });
  }
  return request(`/api/system/role/delete?id=${id}`, { method: 'DELETE' });
}

export async function assignPermission(params: AssignPermissionParams): Promise<{ code: number; msg: string }> {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ code: 200, msg: '分配成功' }), 200);
    });
  }
  return request('/api/system/role/assignPermission', { method: 'POST', data: params });
}
