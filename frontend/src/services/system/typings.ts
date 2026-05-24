/**
 * 系统管理模块 - 统一类型定义
 * 角色展示：super_admin -> 超管, normal_admin -> 普通管理员, user -> 普通用户
 */

/** 后端/接口用角色码 */
export type RoleCode = 'super_admin' | 'normal_admin' | 'user';

/** 角色项（角色管理列表） */
export interface RoleItem {
  id: number;
  code: RoleCode | string;
  name: string;
  description?: string;
  userCount?: number;
  createTime?: string;
}

/** 权限树节点（权限管理） */
export interface PermissionTreeNode {
  id: string;
  name: string;
  type: 'menu' | 'button' | 'data';
  path?: string;
  children?: PermissionTreeNode[];
}

/** 日志类型：系统日志 / 操作日志 */
export type LogType = 'system' | 'operation';

/** 操作人信息（日志中展示用；普管视角下仅显示普通用户姓名） */
export interface LogOperator {
  username: string;
  role?: RoleCode;
}
