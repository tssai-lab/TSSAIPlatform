import { LockOutlined, MobileOutlined, UserOutlined } from '@ant-design/icons';
import { FormattedMessage, Helmet, history, useIntl } from '@umijs/max';
import { Alert, App, Button, Form, Input } from 'antd';
import { createStyles } from 'antd-style';
import React, { useRef, useState } from 'react';
import { registerByMobile } from '@/services/ant-design-pro/api';
import { getFakeCaptcha } from '@/services/ant-design-pro/login';
import Settings from '../../../../config/defaultSettings';

const useStyles = createStyles(({ token }) => {
  return {
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

const RegisterMessage: React.FC<{
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

/**
 * 注册页
 */
const Register: React.FC = () => {
  const [form] = Form.useForm();
  const [registerState, setRegisterState] = useState<{
    status?: string;
    message?: string;
  }>({});
  const [countdown, setCountdown] = useState(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { styles } = useStyles();
  const { message: messageApi } = App.useApp();
  const intl = useIntl();

  // 开始倒计时
  const startCountdown = () => {
    setCountdown(60);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 获取验证码
  const handleGetCaptcha = async () => {
    try {
      const phone = form.getFieldValue('phone');
      if (!phone) {
        messageApi.error('请输入手机号！');
        return;
      }

      // 验证手机号格式
      await form.validateFields(['phone']);

      const result = await getFakeCaptcha({
        phone: phone,
      });

      // 兼容不同的响应格式
      if (result.code === 200 || result.status === 'ok') {
        messageApi.success('验证码发送成功，请使用后端生成的验证码');
        startCountdown();
      } else {
        setRegisterState({
          status: 'error',
          message: (result as any).msg || '验证码发送失败，请重试！',
        });
        messageApi.error((result as any).msg || '验证码发送失败，请重试！');
      }
    } catch (error: any) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      console.error('获取验证码失败:', error);
      setRegisterState({
        status: 'error',
        message: error.message || '验证码发送失败，请重试！',
      });
      messageApi.error(error.message || '验证码发送失败，请重试！');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const response = await registerByMobile({
        password: values.password,
        confirmPassword: values.confirmPassword,
        mobile: values.phone,
        smsCode: values.captcha,
      });

      if (response.code === 200) {
        messageApi.success('注册成功！');
        // 注册成功后跳转到登录页
        setTimeout(() => {
          history.push('/user/login');
        }, 1000);
      } else {
        setRegisterState({
          status: 'error',
          message: response.msg || '注册失败，请重试！',
        });
        messageApi.error(response.msg || '注册失败，请重试！');
      }
    } catch (error: any) {
      console.error('注册失败:', error);
      setRegisterState({
        status: 'error',
        message: error.message || '注册失败，请重试！',
      });
      messageApi.error(error.message || '注册失败，请重试！');
    }
  };

  const { status } = registerState;

  return (
    <div className={styles.container}>
      <Helmet>
        <title>
          {intl.formatMessage({
            id: 'menu.register',
            defaultMessage: '注册页',
          })}
          {Settings.title && ` - ${Settings.title}`}
        </title>
      </Helmet>

      <div
        style={{
          flex: '1',
          padding: '32px 0',
        }}
      >
        <div
          style={{
            margin: '0 auto',
            maxWidth: 400,
            padding: '24px',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <img
              alt="logo"
              src="/estun.png"
              style={{ height: 44, marginBottom: 16 }}
            />
            <h2 style={{ marginBottom: 8 }}>注册账号</h2>
            <p style={{ color: '#999', fontSize: 14 }}>创建您的新账号</p>
          </div>

          {status === 'error' && (
            <RegisterMessage
              content={registerState.message || '注册失败，请重试！'}
            />
          )}

          <Form
            form={form}
            onFinish={handleSubmit}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 6, max: 20, message: '用户名需为6-20位字符' },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="请输入用户名" />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                {
                  pattern: /^\w{6,16}$/,
                  message: '密码6-16位字母/数字/下划线',
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="请输入密码（至少6位）"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="请再次输入密码"
              />
            </Form.Item>

            <Form.Item
              name="phone"
              rules={[
                { required: true, message: '请输入手机号！' },
                { pattern: /^1\d{10}$/, message: '手机号格式错误！' },
              ]}
            >
              <Input
                prefix={<MobileOutlined />}
                placeholder="手机号"
                maxLength={11}
              />
            </Form.Item>

            <Form.Item
              name="captcha"
              rules={[
                { required: true, message: '请输入验证码！' },
                { pattern: /^\d{6}$/, message: '验证码为6位数字' },
              ]}
            >
              <Input
                prefix={<LockOutlined />}
                placeholder="请输入验证码"
                maxLength={6}
                suffix={
                  countdown > 0 ? (
                    <span style={{ color: '#999', fontSize: 12 }}>
                      {countdown}秒后可重新获取
                    </span>
                  ) : (
                    <Button
                      type="link"
                      size="small"
                      onClick={handleGetCaptcha}
                      style={{ padding: 0, height: 'auto' }}
                    >
                      获取验证码
                    </Button>
                  )
                }
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block>
                注册
              </Button>
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
              <Button type="link" onClick={() => history.push('/user/login')}>
                已有账号？去登录
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Register;
