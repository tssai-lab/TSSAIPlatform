import {
  AlipayCircleOutlined,
  LockOutlined,
  MobileOutlined,
  TaobaoCircleOutlined,
  UserOutlined,
  WeiboCircleOutlined,
} from '@ant-design/icons';
import {
  LoginForm,
  ProFormCaptcha,
  ProFormCheckbox,
  ProFormText,
} from '@ant-design/pro-components';
import {
  FormattedMessage,
  Helmet,
  history,
  useIntl,
  useModel,
} from '@umijs/max';
import { Alert, App, Tabs } from 'antd';
import { createStyles } from 'antd-style';
import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { login } from '@/services/ant-design-pro/api';
import { getFakeCaptcha } from '@/services/ant-design-pro/login';
import { STORAGE_KEYS, storage } from '@/utils/storage';
import Settings from '../../../../config/defaultSettings';

const useStyles = createStyles(({ token }) => {
  return {
    action: {
      marginLeft: '8px',
      color: 'rgba(0, 0, 0, 0.2)',
      fontSize: '24px',
      verticalAlign: 'middle',
      cursor: 'pointer',
      transition: 'color 0.3s',
      '&:hover': {
        color: token.colorPrimaryActive,
      },
    },
    // lang 样式已移除（不需要多语言功能）
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'auto',
      backgroundImage:
        "url('https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/V-_oS6r-i7wAAAAAAAAAAAAAFl94AQBr')",
      backgroundSize: '100% 100%',
    },
  };
});

const ActionIcons = () => {
  const { styles } = useStyles();

  return (
    <>
      <AlipayCircleOutlined
        key="AlipayCircleOutlined"
        className={styles.action}
      />
      <TaobaoCircleOutlined
        key="TaobaoCircleOutlined"
        className={styles.action}
      />
      <WeiboCircleOutlined
        key="WeiboCircleOutlined"
        className={styles.action}
      />
    </>
  );
};

// Lang 组件已移除（不需要多语言功能）

const LoginMessage: React.FC<{
  content: string;
}> = ({ content }) => {
  return (
    <Alert
      style={{
        marginBottom: 24,
      }}
      message={content}
      type="error"
      showIcon
    />
  );
};

const Login: React.FC = () => {
  const [userLoginState, setUserLoginState] = useState<API.LoginResult>({});
  const [loginErrorMsg, setLoginErrorMsg] = useState<string>('');
  const [type, setType] = useState<string>('account');
  const { initialState, setInitialState } = useModel('@@initialState');
  const { styles } = useStyles();
  const { message } = App.useApp();
  const intl = useIntl();

  const fetchUserInfo = async () => {
    const userInfo = await initialState?.fetchUserInfo?.();
    if (userInfo) {
      flushSync(() => {
        setInitialState((s) => ({
          ...s,
          currentUser: userInfo,
        }));
      });
    }
  };

  /** 根路径默认进登录页；若本地已有有效 Token 则直接进入工作台 */
  useEffect(() => {
    const token = storage.get(STORAGE_KEYS.TOKEN);
    if (!token) return;
    (async () => {
      const user = await initialState?.fetchUserInfo?.();
      if (user) {
        flushSync(() => {
          setInitialState((s) => ({ ...s, currentUser: user }));
        });
        history.replace('/dashboard');
      }
    })();
  }, []);

  const handleSubmit = async (values: API.LoginParams) => {
    try {
      const payload: API.LoginParams =
        type === 'mobile'
          ? {
              type,
              mobile: values.mobile,
              smsCode: values.captcha,
            }
          : {
              type,
              username: values.username,
              password: values.password,
            };
      // 登录
      const msg = await login(payload);
      // 兼容两种成功标识：status === 'ok'（旧）或 code === 200（后端 code/msg/data）
      const isSuccess =
        (msg as any)?.status === 'ok' || (msg as any)?.code === 200;
      if (isSuccess) {
        setLoginErrorMsg('');
        // 登录成功后把 token 写入本地（使用 utils/storage），供 request 拦截器读取
        const token =
          (msg as any)?.data?.token ??
          (msg as any)?.data?.accessToken ??
          (msg as any)?.token;
        if (token) {
          storage.set(STORAGE_KEYS.TOKEN, token);
        }
        const defaultLoginSuccessMessage = intl.formatMessage({
          id: 'pages.login.success',
          defaultMessage: '登录成功！',
        });
        message.success(defaultLoginSuccessMessage);
        await fetchUserInfo();
        const urlParams = new URL(window.location.href).searchParams;
        const redirect = urlParams.get('redirect') || '/dashboard';
        // 使用 history.push 而不是 window.location.href，避免页面刷新
        setTimeout(() => {
          window.location.href = redirect;
        }, 100);
        return;
      }
      console.log(msg);
      // 如果失败去设置用户错误信息
      setLoginErrorMsg(
        (msg as any)?.msg || (msg as any)?.message || '登录失败，请重试！',
      );
      setUserLoginState(msg);
    } catch (error) {
      console.log(error);
      const errMsg =
        (error as any)?.info?.message ||
        (error as any)?.message ||
        intl.formatMessage({
          id: 'pages.login.failure',
          defaultMessage: '登录失败，请重试！',
        });
      setLoginErrorMsg(errMsg);
      setUserLoginState({
        status: 'error',
        type,
      });
      message.error(errMsg);
    }
  };
  const { status, type: loginType } = userLoginState;

  return (
    <div className={styles.container}>
      {/* header标题，来自umijs */}
      <Helmet>
        <title>
          {/* 国际化 locales文件夹*/}
          {intl.formatMessage({
            id: 'menu.login',
            defaultMessage: '登录页',
          })}
          {/* 全局标题配置，有则显示 */}
          {Settings.title && ` - ${Settings.title}`}
        </title>
      </Helmet>

      <div
        style={{
          flex: '1',
          padding: '32px 0',
        }}
      >
        <LoginForm
          contentStyle={{
            minWidth: 280,
            maxWidth: '75vw',
          }}
          logo={<img alt="logo" src="/estun.png" />}
          title="AI平台"
          subTitle={intl.formatMessage({
            id: 'pages.layouts.userLayout.title',
          })}
          initialValues={{
            autoLogin: true,
          }}
          actions={[
            <FormattedMessage
              key="loginWith"
              id="pages.login.loginWith"
              defaultMessage="其他登录方式"
            />,
            <ActionIcons key="icons" />,
          ]}
          onFinish={async (values) => {
            await handleSubmit(values as API.LoginParams);
          }}
        >
          <Tabs
            activeKey={type}
            onChange={setType}
            centered
            items={[
              {
                key: 'account',
                label: intl.formatMessage({
                  id: 'pages.login.accountLogin.tab',
                  defaultMessage: '账户密码登录',
                }),
              },
              {
                key: 'mobile',
                label: intl.formatMessage({
                  id: 'pages.login.phoneLogin.tab',
                  defaultMessage: '手机号登录',
                }),
              },
            ]}
          />

          {status === 'error' && loginType === 'account' && (
            <LoginMessage
              content={
                loginErrorMsg ||
                intl.formatMessage({
                  id: 'pages.login.accountLogin.errorMessage',
                  defaultMessage: '账户或密码错误(admin/ant.design)',
                })
              }
            />
          )}
          {type === 'account' && (
            <>
              <ProFormText
                name="username"
                fieldProps={{
                  size: 'large',
                  prefix: <UserOutlined />,
                }}
                placeholder={intl.formatMessage({
                  id: 'pages.login.username.placeholder',
                  defaultMessage: '用户名: admin or user',
                })}
                rules={[
                  {
                    required: true,
                    message: (
                      <FormattedMessage
                        id="pages.login.username.required"
                        defaultMessage="请输入用户名!"
                      />
                    ),
                  },
                ]}
              />
              <ProFormText.Password
                name="password"
                fieldProps={{
                  size: 'large',
                  prefix: <LockOutlined />,
                }}
                placeholder={intl.formatMessage({
                  id: 'pages.login.password.placeholder',
                  defaultMessage: '密码: ant.design',
                })}
                rules={[
                  {
                    required: true,
                    message: (
                      <FormattedMessage
                        id="pages.login.password.required"
                        defaultMessage="请输入密码！"
                      />
                    ),
                  },
                ]}
              />
            </>
          )}

          {status === 'error' && loginType === 'mobile' && (
            <LoginMessage content={loginErrorMsg || '验证码错误'} />
          )}
          {type === 'mobile' && (
            <>
              <ProFormText
                fieldProps={{
                  size: 'large',
                  prefix: <MobileOutlined />,
                }}
                name="mobile"
                placeholder={intl.formatMessage({
                  id: 'pages.login.phoneNumber.placeholder',
                  defaultMessage: '手机号',
                })}
                rules={[
                  {
                    required: true,
                    message: (
                      <FormattedMessage
                        id="pages.login.phoneNumber.required"
                        defaultMessage="请输入手机号！"
                      />
                    ),
                  },
                  {
                    pattern: /^1\d{10}$/,
                    message: (
                      <FormattedMessage
                        id="pages.login.phoneNumber.invalid"
                        defaultMessage="手机号格式错误！"
                      />
                    ),
                  },
                ]}
              />
              <ProFormCaptcha
                phoneName="mobile"
                fieldProps={{
                  size: 'large',
                  prefix: <LockOutlined />,
                  maxLength: 6,
                }}
                captchaProps={{
                  size: 'large',
                }}
                placeholder={intl.formatMessage({
                  id: 'pages.login.captcha.placeholder',
                  defaultMessage: '请输入验证码',
                })}
                captchaTextRender={(timing, count) => {
                  if (timing) {
                    return `${count} ${intl.formatMessage({
                      id: 'pages.getCaptchaSecondText',
                      defaultMessage: '获取验证码',
                    })}`;
                  }
                  return intl.formatMessage({
                    id: 'pages.login.phoneLogin.getVerificationCode',
                    defaultMessage: '获取验证码',
                  });
                }}
                name="captcha"
                rules={[
                  {
                    required: true,
                    message: (
                      <FormattedMessage
                        id="pages.login.captcha.required"
                        defaultMessage="请输入验证码！"
                      />
                    ),
                  },
                  {
                    pattern: /^\d{6}$/,
                    message: '验证码为6位数字',
                  },
                ]}
                onGetCaptcha={async (phone) => {
                  if (!phone) {
                    message.error('请先输入正确的手机号');
                    return;
                  }
                  const result = await getFakeCaptcha({
                    phone,
                  });
                  if (
                    (result as any)?.code === 200 ||
                    (result as any)?.status === 'ok'
                  ) {
                    message.success(
                      '验证码发送成功，请使用后端生成的验证码登录',
                    );
                  } else {
                    message.error(
                      (result as any)?.msg || '验证码发送失败，请重试',
                    );
                  }
                }}
              />
            </>
          )}
          <div
            style={{
              marginBottom: 24,
            }}
          >
            <ProFormCheckbox noStyle name="autoLogin">
              <FormattedMessage
                id="pages.login.rememberMe"
                defaultMessage="自动登录"
              />
            </ProFormCheckbox>
            <a
              style={{
                float: 'right',
              }}
              onClick={() => history.push('/user/forgot-password')}
            >
              <FormattedMessage
                id="pages.login.forgotPassword"
                defaultMessage="忘记密码"
              />
            </a>
          </div>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <FormattedMessage
              id="pages.login.noAccount"
              defaultMessage="还没有账号？"
            />
            <a
              onClick={() => history.push('/user/register')}
              style={{ marginLeft: 8 }}
            >
              <FormattedMessage
                id="pages.login.register"
                defaultMessage="立即注册"
              />
            </a>
          </div>
        </LoginForm>
      </div>
    </div>
  );
};

export default Login;
