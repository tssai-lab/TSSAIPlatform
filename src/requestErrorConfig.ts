import type { RequestOptions } from '@@/plugin-request/request';
import type { RequestConfig } from '@umijs/max';
import { message } from 'antd';
import storage from './utils/storage';
import { STORAGE_KEYS } from './constants/storageKeys';

/** 后端标准响应格式：code, message, data */
interface BackendResponse {
  code?: number;
  message?: string;
  data?: any;
  success?: boolean; // 由响应拦截器根据 code 构造
}

/** 错误信息结构（error.info） */
interface BizErrorInfo {
  code?: number;
  message?: string;
  data?: any;
}

/**
 * Request 服务层 - 错误处理
 * 文档：前端请求结构说明
 * 1. errorThrower：判断是否有错误，有则抛出 BizError
 * 2. errorHandler：统一处理错误（401 跳转登录、403 权限、其他提示）
 */
export const errorConfig: RequestConfig = {
  errorConfig: {
    /** 判断是否有错误，有错误则抛出 */
    errorThrower: (res) => {
      const { success, code, message: msg, data } = res as unknown as BackendResponse;
      if (success === false) {
        const error: any = new Error(msg || '请求失败');
        error.name = 'BizError';
        error.info = { code, message: msg, data } as BizErrorInfo;
        throw error;
      }
    },
    /** 统一错误处理 */
    errorHandler: (error: any, opts: any) => {
      if (opts?.skipErrorHandler) throw error;

      if (error.name === 'BizError') {
        const info = error.info as BizErrorInfo | undefined;
        const code = info?.code;
        const msg = info?.message || error.message;

        if (code === 401) {
          message.error('鉴权失败');
          // 开发阶段无后端，不跳转登录页
          // window.location.href = '/user/login';
          return;
        }
        if (code === 403) {
          message.error('暂无操作权限');
          return;
        }
        message.error(msg || '业务处理失败');
      } else if (error.response) {
        message.error(`请求失败: ${error.response.status}`);
      } else if (error.request) {
        message.error('请求超时或网络错误');
      } else {
        message.error('请求失败，请重试');
      }
    },
  },

  /** 请求拦截器：在请求头中添加 token */
  requestInterceptors: [
    (config: RequestOptions) => {
      const token = storage.get<string>(STORAGE_KEYS.TOKEN);
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        };
      }
      return config;
    },
  ],

  /** 响应拦截器：根据后端 code 构造 success，供框架错误处理使用 */
  responseInterceptors: [
    (response: any) => {
      const data = response?.data as BackendResponse | undefined;
      if (data && typeof data === 'object' && 'code' in data && !('success' in data)) {
        data.success = data.code === 200;
      }
      return response;
    },
  ],
};
