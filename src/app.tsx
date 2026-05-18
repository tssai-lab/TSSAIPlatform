import type { Settings as LayoutSettings } from '@ant-design/pro-components';
import { SettingDrawer } from '@ant-design/pro-components';
import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history } from '@umijs/max';
import { message, notification } from 'antd';
import React from 'react';
import { AvatarDropdown, AvatarName } from '@/components';
import { currentUser as queryCurrentUser } from '@/services/ant-design-pro/api';
import { STORAGE_KEYS, storage } from '@/utils/storage';
import defaultSettings from '../config/defaultSettings';
import '@ant-design/v5-patch-for-react-19';

const isDev = process.env.NODE_ENV === 'development';
const loginPath = '/user/login';
const apiBaseURL = process.env.REACT_APP_API_BASE_URL || '';

function getMockCurrentUserByRole(role: string): API.CurrentUser {
  const roleMap: Record<string, { name: string; userid: string }> = {
    super_admin: { name: 'admin（超管）', userid: 'admin' },
    normal_admin: { name: 'manager1（普管）', userid: 'manager1' },
    user: { name: 'test01（普通用户）', userid: 'test01' },
  };

  const current = roleMap[role] || roleMap.super_admin;
  return {
    name: current.name,
    userid: current.userid,
    role: role as API.UserRole,
  };
}

export async function getInitialState(): Promise<{
  settings?: Partial<LayoutSettings>;
  currentUser?: API.CurrentUser;
  loading?: boolean;
  fetchUserInfo?: () => Promise<API.CurrentUser | undefined>;
}> {
  const fetchUserInfo = async () => {
    try {
      const msg = await queryCurrentUser({
        skipErrorHandler: true,
      });
      const user = msg.data;

      if (isDev && typeof window !== 'undefined') {
        const mockRole = window.localStorage.getItem(
          'mock_role',
        ) as API.UserRole | null;
        if (
          mockRole &&
          ['super_admin', 'normal_admin', 'user'].includes(mockRole)
        ) {
          return { ...user, role: mockRole } as API.CurrentUser;
        }
        if (user && !user.role) {
          return { ...user, role: 'super_admin' } as API.CurrentUser;
        }
      }

      return user;
    } catch (_error) {
      history.push(loginPath);
      return undefined;
    }
  };

  const { location } = history;
  if (
    ![
      loginPath,
      '/user/register',
      '/user/register-result',
      '/user/forgot-password',
      '/user/reset-password',
    ].includes(location.pathname)
  ) {
    let currentUser = await fetchUserInfo();
    if (isDev && typeof window !== 'undefined' && !currentUser) {
      const mockRole = window.localStorage.getItem(
        'mock_role',
      ) as API.UserRole | null;
      if (
        mockRole &&
        ['super_admin', 'normal_admin', 'user'].includes(mockRole)
      ) {
        currentUser = getMockCurrentUserByRole(mockRole);
      } else {
        currentUser = getMockCurrentUserByRole('super_admin');
      }
    }

    return {
      fetchUserInfo,
      currentUser,
      settings: defaultSettings as Partial<LayoutSettings>,
    };
  }

  return {
    fetchUserInfo,
    currentUser: isDev ? getMockCurrentUserByRole('super_admin') : undefined,
    settings: defaultSettings as Partial<LayoutSettings>,
  };
}

export const layout: RunTimeLayoutConfig = ({
  initialState,
  setInitialState,
}) => {
  return {
    avatarProps: {
      src: initialState?.currentUser?.avatar,
      title: <AvatarName />,
      render: (_, avatarChildren) => {
        return <AvatarDropdown>{avatarChildren}</AvatarDropdown>;
      },
    },
    footerRender: false,
    onPageChange: () => {
      return;
    },
    bgLayoutImgList: [
      {
        src: 'https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/D2LWSqNny4sAAAAAAAAAAAAAFl94AQBr',
        left: 85,
        bottom: 100,
        height: '303px',
      },
      {
        src: 'https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/C2TWRpJpiC0AAAAAAAAAAAAAFl94AQBr',
        bottom: -68,
        right: -45,
        height: '303px',
      },
      {
        src: 'https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/F6vSTbj8KpYAAAAAAAAAAAAAFl94AQBr',
        bottom: 0,
        left: 0,
        width: '331px',
      },
    ],
    menuHeaderRender: undefined,
    childrenRender: (children) => {
      return (
        <>
          {children}
          {isDev && (
            <SettingDrawer
              disableUrlParams
              enableDarkTheme
              settings={initialState?.settings}
              onSettingChange={(settings) => {
                setInitialState((preInitialState) => ({
                  ...preInitialState,
                  settings,
                }));
              }}
            />
          )}
        </>
      );
    },
    ...initialState?.settings,
  };
};

export const request: RequestConfig = {
  timeout: 300000,
  baseURL: apiBaseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  errorConfig: {
    errorThrower: (res) => {
      const resAny = (res as any) ?? {};
      const { code, message, msg, data, errorMessage, success } = resAny;
      const messageText =
        (typeof errorMessage === 'string' && errorMessage.trim()) ||
        (typeof msg === 'string' && msg) ||
        (typeof message === 'string' && message) ||
        '请求失败';
      let isSuccess = true;
      if (typeof success === 'boolean') {
        isSuccess = success;
      } else if (typeof code === 'number') {
        isSuccess = code === 200;
      }
      if (!isSuccess) {
        const error = new Error(messageText) as any;
        error.name = 'BizError';
        error.info = { code, data, errorMessage };
        throw error;
      }
    },
    errorHandler: (error: any, opts: any) => {
      if (opts?.skipErrorHandler) return;

      if (error.name === 'AxiosError') {
        if (error.code === 'ECONNABORTED') {
          message.error('请求超时，请稍后重试');
        } else {
          message.error(`网络错误：${error.message || '无法连接服务器'}`);
        }
      } else if (error.name === 'BizError') {
        const { code } = error.info ?? {};
        switch (code) {
          case 401:
            notification.error({ message: '登录失效，请重新登录' });
            history.push(loginPath);
            break;
          case 403:
            message.warning('暂无操作权限，请联系管理员');
            break;
          default:
            message.error(error.message || '业务处理失败');
        }
      }
    },
  },
  requestInterceptors: [
    (config: any) => {
      const token = storage.get<string>(STORAGE_KEYS.TOKEN);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${typeof token === 'string' ? token : ''}`;
      }
      return config;
    },
  ],
  responseInterceptors: [
    (response) => {
      const data = response?.data as
        | { code?: number; success?: boolean }
        | undefined;
      if (data && typeof data.code !== 'undefined' && data.code !== 200) {
        data.success = false;
      }
      return response;
    },
  ],
};
