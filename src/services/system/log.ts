// @ts-ignore
/* eslint-disable */
import { request } from '@umijs/max';
import dayjs from 'dayjs';

import type { CurrentUserRoleForApi } from './user';

// 查询日志列表请求参数
export interface LogListParams {
  pageNum?: number;
  pageSize?: number;
  username?: string;
  operateType?: string;
  operateTime?: string[];
  ip?: string;
  result?: string;
  /** 系统日志 | 操作日志 */
  logType?: 'system' | 'operation';
  /** 当前用户角色：普通管理员时仅返回普通用户操作日志（且隐藏管理员姓名、IP） */
  currentUserRole?: CurrentUserRoleForApi;
  /** 仅查看当前用户自己的操作记录（个人中心-我的操作记录） */
  currentUsername?: string;
  /** 操作内容关键词（我的操作记录筛选） */
  content?: string;
}

// 查询日志列表响应
export interface LogListResponse {
  code: number;
  msg: string;
  data: {
    list: LogItem[];
    total: number;
  };
}

// 日志项（username 为操作人姓名/账号）
export interface LogItem {
  id: number;
  username: string;
  operateType: string;
  operateTime: string; // YYYY-MM-DD HH:mm:ss
  ip: string;
  content: string;
  result: 'success' | 'failed';
  /** 操作人角色，mock 按权限过滤时使用；普管视角仅展示普通用户日志 */
  operatorRole?: 'super_admin' | 'normal_admin' | 'user';
  /** 系统日志 | 操作日志 */
  logType?: 'system' | 'operation';
}

// 通用响应
export interface CommonResponse {
  code: number;
  msg: string;
  data?: any;
}

// 模拟日志数据（含操作人角色，用于普管视角过滤：仅展示普通用户姓名对应的日志）
const mockLogs: LogItem[] = [
  {
    id: 1,
    username: 'admin',
    operateType: '登录',
    operateTime: '2026-02-15 09:30:25',
    ip: '192.168.1.100',
    content: '用户登录系统',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'operation',
  },
  {
    id: 2,
    username: 'admin',
    operateType: '用户管理',
    operateTime: '2026-02-15 10:15:42',
    ip: '192.168.1.100',
    content: '新增用户：test01',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'operation',
  },
  {
    id: 3,
    username: 'admin',
    operateType: '用户管理',
    operateTime: '2026-02-15 10:20:18',
    ip: '192.168.1.100',
    content: '编辑用户：test01，修改角色为普通用户',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'operation',
  },
  {
    id: 4,
    username: 'test01',
    operateType: '登录',
    operateTime: '2026-02-15 11:05:33',
    ip: '192.168.1.101',
    content: '用户登录系统',
    result: 'success',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 5,
    username: 'test01',
    operateType: '登录',
    operateTime: '2026-02-15 11:30:15',
    ip: '192.168.1.101',
    content: '用户登录系统，密码错误',
    result: 'failed',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 6,
    username: 'admin',
    operateType: '用户管理',
    operateTime: '2026-02-15 14:22:56',
    ip: '192.168.1.100',
    content: '删除用户：test02',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'operation',
  },
  {
    id: 7,
    username: 'zhangsan',
    operateType: '登录',
    operateTime: '2026-02-15 15:10:20',
    ip: '192.168.1.102',
    content: '用户登录系统',
    result: 'success',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 8,
    username: 'admin',
    operateType: '审计日志',
    operateTime: '2026-02-15 16:45:12',
    ip: '192.168.1.100',
    content: '导出审计日志',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'operation',
  },
  {
    id: 9,
    username: 'lisi',
    operateType: '登录',
    operateTime: '2026-02-15 17:20:35',
    ip: '192.168.1.103',
    content: '用户登录系统',
    result: 'success',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 10,
    username: 'admin',
    operateType: '用户管理',
    operateTime: '2026-02-15 18:05:48',
    ip: '192.168.1.100',
    content: '禁用用户：test03',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'operation',
  },
  {
    id: 11,
    username: 'test01',
    operateType: '数据查询',
    operateTime: '2026-02-16 09:15:22',
    ip: '192.168.1.101',
    content: '查询模型列表',
    result: 'success',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 12,
    username: 'admin',
    operateType: '用户管理',
    operateTime: '2026-02-16 10:30:15',
    ip: '192.168.1.100',
    content: '启用用户：test03',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'operation',
  },
  {
    id: 13,
    username: 'zhangsan',
    operateType: '数据上传',
    operateTime: '2026-02-16 11:20:40',
    ip: '192.168.1.102',
    content: '上传数据集：dataset_001',
    result: 'success',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 14,
    username: 'lisi',
    operateType: '数据上传',
    operateTime: '2026-02-16 12:10:55',
    ip: '192.168.1.103',
    content: '上传数据集：dataset_002，文件大小超限',
    result: 'failed',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 15,
    username: 'admin',
    operateType: '系统配置',
    operateTime: '2026-02-16 13:45:30',
    ip: '192.168.1.100',
    content: '修改系统配置：最大文件上传大小',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'system',
  },
  {
    id: 16,
    username: 'test01',
    operateType: '任务创建',
    operateTime: '2026-02-16 14:30:18',
    ip: '192.168.1.101',
    content: '创建训练任务：task_001',
    result: 'success',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 17,
    username: 'admin',
    operateType: '用户管理',
    operateTime: '2026-02-16 15:20:42',
    ip: '192.168.1.100',
    content: '修改用户：test01，更新手机号',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'operation',
  },
  {
    id: 18,
    username: 'zhangsan',
    operateType: '登录',
    operateTime: '2026-02-16 16:05:25',
    ip: '192.168.1.102',
    content: '用户登录系统',
    result: 'success',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 19,
    username: 'lisi',
    operateType: '数据查询',
    operateTime: '2026-02-16 17:15:50',
    ip: '192.168.1.103',
    content: '查询任务列表',
    result: 'success',
    operatorRole: 'user',
    logType: 'operation',
  },
  {
    id: 20,
    username: 'admin',
    operateType: '审计日志',
    operateTime: '2026-02-16 18:30:10',
    ip: '192.168.1.100',
    content: '查询审计日志',
    result: 'success',
    operatorRole: 'super_admin',
    logType: 'operation',
  },
  {
    id: 21,
    username: 'manager1',
    operateType: '用户管理',
    operateTime: '2026-02-16 19:00:00',
    ip: '192.168.1.105',
    content: '编辑用户：test01，修改手机号',
    result: 'success',
    operatorRole: 'normal_admin',
    logType: 'operation',
  },
];

const USE_MOCK_DATA = process.env.NODE_ENV === 'development';

/** 查询日志列表 GET /api/system/log/list */
export async function getLogList(params: LogListParams) {
  // 开发环境使用模拟数据
  if (USE_MOCK_DATA) {
    return new Promise<LogListResponse>((resolve) => {
      setTimeout(() => {
        const { pageNum = 1, pageSize = 10, username, operateType, operateTime, ip, result, logType, currentUserRole, currentUsername, content: contentKeyword } = params;

        let filteredLogs = [...mockLogs];

        // 个人中心-我的操作记录：仅当前用户自己的日志
        if (currentUsername) {
          filteredLogs = filteredLogs.filter((log) => log.username === currentUsername);
        }

        // 权限隔离：普通管理员仅能查看普通用户的操作日志（隐藏管理员姓名、IP 在列表列配置中处理）
        if (currentUserRole === 'normal_admin') {
          filteredLogs = filteredLogs.filter((log) => log.operatorRole === 'user');
        }

        // 按日志类型筛选：系统日志 / 操作日志
        if (logType) {
          filteredLogs = filteredLogs.filter((log) => (log.logType || 'operation') === logType);
        }

        // 按用户名筛选
        if (username) {
          filteredLogs = filteredLogs.filter((log) =>
            log.username.toLowerCase().includes(username.toLowerCase())
          );
        }

        // 按操作内容关键词筛选（如个人中心-我的操作记录）
        if (contentKeyword) {
          filteredLogs = filteredLogs.filter((log) => log.content.includes(contentKeyword));
        }

        // 按操作类型筛选
        if (operateType) {
          filteredLogs = filteredLogs.filter((log) => log.operateType === operateType);
        }

        // 按IP地址筛选
        if (ip) {
          filteredLogs = filteredLogs.filter((log) => log.ip.includes(ip));
        }

        // 按结果筛选
        if (result) {
          filteredLogs = filteredLogs.filter((log) => log.result === result);
        }

        // 按操作时间范围筛选
        if (operateTime && operateTime.length === 2 && operateTime[0] && operateTime[1]) {
          const startTime = dayjs(operateTime[0]);
          const endTime = dayjs(operateTime[1]);
          filteredLogs = filteredLogs.filter((log) => {
            const logTime = dayjs(log.operateTime);
            return (logTime.isAfter(startTime) || logTime.isSame(startTime)) && 
                   (logTime.isBefore(endTime) || logTime.isSame(endTime));
          });
        }

        // 按时间倒序排列（最新的在前）
        filteredLogs.sort((a, b) => {
          return dayjs(b.operateTime).valueOf() - dayjs(a.operateTime).valueOf();
        });

        const total = filteredLogs.length;
        const start = (pageNum - 1) * pageSize;
        const end = start + pageSize;
        const list = filteredLogs.slice(start, end);

        resolve({
          code: 200,
          msg: '查询成功',
          data: { list, total },
        });
      }, 300);
    });
  }

  // 生产环境使用真实接口
  return request<LogListResponse>('/system/log/list', {
    method: 'GET',
    params,
  });
}

/** 导出日志 GET /api/system/log/export */
export async function exportLog(params: LogListParams) {
  // 开发环境使用模拟数据
  if (USE_MOCK_DATA) {
    return new Promise<CommonResponse>((resolve) => {
      setTimeout(() => {
        // 模拟导出逻辑
        const { username, operateType, operateTime, ip, result } = params;

        let filteredLogs = [...mockLogs];

        // 应用相同的筛选逻辑
        if (username) {
          filteredLogs = filteredLogs.filter((log) =>
            log.username.toLowerCase().includes(username.toLowerCase())
          );
        }
        if (operateType) {
          filteredLogs = filteredLogs.filter((log) => log.operateType === operateType);
        }
        if (ip) {
          filteredLogs = filteredLogs.filter((log) => log.ip.includes(ip));
        }
        if (result) {
          filteredLogs = filteredLogs.filter((log) => log.result === result);
        }
        if (operateTime && operateTime.length === 2 && operateTime[0] && operateTime[1]) {
          const startTime = dayjs(operateTime[0]);
          const endTime = dayjs(operateTime[1]);
          filteredLogs = filteredLogs.filter((log) => {
            const logTime = dayjs(log.operateTime);
            return (logTime.isAfter(startTime) || logTime.isSame(startTime)) && 
                   (logTime.isBefore(endTime) || logTime.isSame(endTime));
          });
        }

        // 按时间倒序排列
        filteredLogs.sort((a, b) => {
          return dayjs(b.operateTime).valueOf() - dayjs(a.operateTime).valueOf();
        });

        resolve({
          code: 200,
          msg: '导出成功',
          data: {
            count: filteredLogs.length,
            downloadUrl: 'https://example.com/download/audit_log_export.xlsx',
          },
        });
      }, 500);
    });
  }

  // 生产环境使用真实接口
  return request<CommonResponse>('/system/log/export', {
    method: 'GET',
    params,
  });
}

