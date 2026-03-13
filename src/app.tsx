import { LinkOutlined } from '@ant-design/icons';
import type { Settings as LayoutSettings } from '@ant-design/pro-components';
import { SettingDrawer } from '@ant-design/pro-components';
import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history, Link } from '@umijs/max';
import { message, notification } from 'antd';
import React from 'react';
import { AvatarDropdown, AvatarName, Footer, Question } from '@/components';
import { currentUser as queryCurrentUser } from '@/services/ant-design-pro/api';
import { STORAGE_KEYS, storage } from '@/utils/storage';
import defaultSettings from '../config/defaultSettings';
import '@ant-design/v5-patch-for-react-19';

const isDev = process.env.NODE_ENV === 'development';
const loginPath = '/user/login';

/** 开发环境：根据 localStorage.mock_role 返回模拟用户，用于验证不同角色权限；userid 用于「我的操作记录」按用户名过滤 */
function getMockCurrentUserByRole(role: string): API.CurrentUser {
  const roleMap: Record<string, { name: string; userid: string }> = {
    super_admin: { name: 'admin（超管）', userid: 'admin' },
    normal_admin: { name: 'manager1（普管）', userid: 'manager1' },
    user: { name: 'test01（普通用户）', userid: 'test01' },
  };
  const o = roleMap[role] || roleMap.super_admin;
  return { name: o.name, userid: o.userid, role: role as API.UserRole };
}

/**
 * @see https://umijs.org/docs/api/runtime-config#getinitialstate
 * */
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
      // 开发环境：若本地设置了 mock_role，则覆盖角色以模拟不同权限
      if (isDev && typeof window !== 'undefined') {
        const mockRole = window.localStorage.getItem(
          'mock_role',
        ) as API.UserRole | null;
        if (
          mockRole &&
          (mockRole === 'super_admin' ||
            mockRole === 'normal_admin' ||
            mockRole === 'user')
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
    // 开发环境：无登录接口时使用 mock 角色，便于切换角色验证权限
    if (isDev && typeof window !== 'undefined' && !currentUser) {
      const mockRole = window.localStorage.getItem(
        'mock_role',
      ) as API.UserRole | null;
      if (
        mockRole &&
        (mockRole === 'super_admin' ||
          mockRole === 'normal_admin' ||
          mockRole === 'user')
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
    currentUser: getMockCurrentUserByRole('super_admin'),
    settings: defaultSettings as Partial<LayoutSettings>,
  };
}

// ProLayout 支持的api https://procomponents.ant.design/components/layout
export const layout: RunTimeLayoutConfig = ({
  initialState,
  setInitialState,
}) => {
  return {
    // 顶部导航栏右侧的菜单
    actionsRender: () => [<Question key="doc" />],
    // 配置顶部栏右侧的用户头像
    avatarProps: {
      // 头像图片地址
      src: initialState?.currentUser?.avatar,
      // 头像hover时的提示（用户名）
      title: <AvatarName />,
      // 点击/hover头像时的下拉菜单
      render: (_, avatarChildren) => {
        return <AvatarDropdown>{avatarChildren}</AvatarDropdown>;
      },
    },
    // 页面水印（已关闭）
    // waterMarkProps: {
    //   content: initialState?.currentUser?.name,
    // },
    // 配置全局页脚
    footerRender: () => <Footer />,

    onPageChange: () => {
      // 开发阶段已使用 Mock 用户，不再强制跳转登录
      // if (!initialState?.currentUser && location.pathname !== loginPath) {
      //   history.push(loginPath);
      // }
    },
    // 配置布局装饰背景图
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
    links: isDev
      ? [
          <Link key="openapi" to="/umi/plugin/openapi" target="_blank">
            <LinkOutlined />
            <span>OpenAPI 文档</span>
          </Link>,
        ]
      : [],
    // 边栏顶部默认 Logo
    menuHeaderRender: undefined,
    // 自定义 403 页面
    // unAccessible: <div>unAccessible</div>,
    // 增加一个 loading 的状态
    childrenRender: (children) => {
      // if (initialState?.loading) return <PageLoading />;
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

/**
 * @name request 配置，可以配置错误处理
 * 它基于 axios 和 ahooks 的 useRequest 提供了一套统一的网络请求和错误处理方案。
 * @doc https://umijs.org/docs/max/request#配置
 */
// 全局请求配置
export const request: RequestConfig = {
  timeout: 10000,
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },

  errorConfig: {
    errorThrower: (res) => {
      const resAny = (res as any) ?? {};
      const { code, message, msg, data } = resAny;
      const messageText = msg ?? message;
      const isSuccess =
        typeof code !== 'undefined' ? code === 200 : resAny.success;
      if (!isSuccess) {
        const error = new Error(messageText || '请求失败') as any;
        error.name = 'BizError';
        error.info = { code, data };
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
      // 与登录页 storage.set(STORAGE_KEYS.TOKEN, token) 成对
      const token = storage.get<string>(STORAGE_KEYS.TOKEN);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${typeof token === 'string' ? token : ''}`;
      }
      return config;
    },
  ],

  responseInterceptors: [
    (response) => {
      // 插件只有 data.success === false 时才调用 errorThrower，后端用 code 表示错误，这里把 code !== 200 转成 success: false
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
