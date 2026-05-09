/**
 * 系统模块 Mock 数据
 * 用于开发阶段展示，后端接口就绪后可移除或改为接口返回
 */

type SysRoleName = '超管' | '普通管理员' | '普通用户';
type SysStatusName = '启用' | '禁用';
type SysLogResult = 'success' | 'failed';
type SysLogType = 'system' | 'operation';

export interface SysUserItem {
  id: number;
  username: string;
  phone: string;
  department?: string;
  role: SysRoleName;
  status: SysStatusName;
  createTime: string; // YYYY-MM-DD
}

export interface SysLogItem {
  id: number;
  username: string;
  operateType: string;
  operateTime: string; // YYYY-MM-DD HH:mm:ss
  ip: string;
  content: string;
  result: SysLogResult;
  logType?: SysLogType;
}

type PasswordPolicy = 'normal' | 'strong';

export interface SysSystemConfig {
  defaultDepartment: string;
  enableAuditLog: boolean;
  passwordPolicy: PasswordPolicy;
}

export const MOCK_SYS_ADMINS: SysUserItem[] = [
  {
    id: 1,
    username: 'root',
    phone: '13800000000',
    department: '默认部门',
    role: '超管',
    status: '启用',
    createTime: '2026-01-01',
  },
  {
    id: 2,
    username: 'admin01',
    phone: '13900000001',
    department: '默认部门',
    role: '普通管理员',
    status: '启用',
    createTime: '2026-01-10',
  },
  {
    id: 3,
    username: 'admin02',
    phone: '13900000002',
    department: '默认部门',
    role: '普通管理员',
    status: '禁用',
    createTime: '2026-02-03',
  },
];

export const MOCK_SYS_USERS: SysUserItem[] = [
  ...MOCK_SYS_ADMINS,
  {
    id: 101,
    username: 'user001',
    phone: '13700001001',
    department: '默认部门',
    role: '普通用户',
    status: '启用',
    createTime: '2026-02-10',
  },
  {
    id: 102,
    username: 'user002',
    phone: '13700001002',
    department: '默认部门',
    role: '普通用户',
    status: '启用',
    createTime: '2026-02-12',
  },
  {
    id: 103,
    username: 'user003',
    phone: '13700001003',
    department: '默认部门',
    role: '普通用户',
    status: '禁用',
    createTime: '2026-02-18',
  },
  {
    id: 104,
    username: 'user004',
    phone: '13700001004',
    department: '默认部门',
    role: '普通用户',
    status: '启用',
    createTime: '2026-03-02',
  },
];

export const MOCK_SYS_PROMOTABLE_USERS: SysUserItem[] = MOCK_SYS_USERS.filter(
  (u) => u.role === '普通用户' && u.status === '启用',
);

export const MOCK_SYS_LOGS: SysLogItem[] = [
  {
    id: 1,
    username: 'root',
    operateType: '登录',
    operateTime: '2026-04-01 09:00:12',
    ip: '10.0.0.10',
    content: '用户登录成功',
    result: 'success',
    logType: 'system',
  },
  {
    id: 2,
    username: 'admin01',
    operateType: '新增用户',
    operateTime: '2026-04-01 10:15:31',
    ip: '10.0.0.11',
    content: '新增用户 user004',
    result: 'success',
    logType: 'operation',
  },
  {
    id: 3,
    username: 'admin02',
    operateType: '修改用户状态',
    operateTime: '2026-04-02 14:03:50',
    ip: '10.0.0.12',
    content: '禁用用户 user003',
    result: 'failed',
    logType: 'operation',
  },
  {
    id: 4,
    username: 'user001',
    operateType: '查看模型列表',
    operateTime: '2026-04-03 16:20:05',
    ip: '10.0.1.21',
    content: '访问 /model/list',
    result: 'success',
    logType: 'operation',
  },
];

export const MOCK_SYS_SYSTEM_CONFIG: SysSystemConfig = {
  defaultDepartment: '默认部门',
  enableAuditLog: true,
  passwordPolicy: 'strong',
};

export const toPagedData = <T>(list: T[], total?: number) => ({
  list,
  total: typeof total === 'number' ? total : list.length,
});
