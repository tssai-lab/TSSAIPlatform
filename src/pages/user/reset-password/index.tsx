import { LockOutlined, MobileOutlined } from '@ant-design/icons';
import { FormattedMessage, Helmet, history, useIntl } from '@umijs/max';
import { Alert, App, Button, Form, Input } from 'antd';
import { createStyles } from 'antd-style';
import React, { useEffect, useRef, useState } from 'react';
import { Footer } from '@/components';
import { resetPassword } from '@/services/ant-design-pro/api';
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

const ResetPasswordMessage: React.FC<{
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
 * 重置密码页 - 第二步：输入验证码和新密码
 */
const ResetPassword: React.FC = () => {
  const [form] = Form.useForm();
  const [resetPasswordState, setResetPasswordState] = useState<{
    status?: string;
    message?: string;
  }>({});
  const [countdown, setCountdown] = useState(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { styles } = useStyles();
  const { message: messageApi } = App.useApp();
  const intl = useIntl();

  // 从URL参数获取手机号
  const getPhoneFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('phone') || '';
  };
  const phoneFromUrl = getPhoneFromUrl();

  useEffect(() => {
    if (phoneFromUrl) {
      form.setFieldsValue({ phone: phoneFromUrl });
    } else {
      // 如果没有手机号参数，跳转到忘记密码页面
      messageApi.warning('请先输入手机号');
      history.push('/user/forgot-password');
    }
  }, [phoneFromUrl]);

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
      const phone = form.getFieldValue('phone') || phoneFromUrl;
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
        // 开发环境显示验证码，生产环境不显示
        if ((result as any).data?.captcha) {
          messageApi.success(
            `验证码发送成功！验证码为：${(result as any).data.captcha}`,
          );
        } else {
          messageApi.success('验证码已发送到您的手机，请查收');
        }
        startCountdown();
      } else {
        setResetPasswordState({
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
      setResetPasswordState({
        status: 'error',
        message: error.message || '验证码发送失败，请重试！',
      });
      messageApi.error(error.message || '验证码发送失败，请重试！');
    }
  };

  // 重置密码
  const handleResetPassword = async (values: any) => {
    try {
      const phone = values.phone || phoneFromUrl;
      const response = await resetPassword({
        phone: phone,
        captcha: values.captcha,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });

      if (response.code === 200) {
        messageApi.success('密码重置成功！');
        // 跳转到登录页
        setTimeout(() => {
          history.push('/user/login');
        }, 1000);
      } else {
        setResetPasswordState({
          status: 'error',
          message: response.msg || '密码重置失败，请重试！',
        });
        messageApi.error(response.msg || '密码重置失败，请重试！');
      }
    } catch (error: any) {
      console.error('重置密码失败:', error);
      setResetPasswordState({
        status: 'error',
        message: error.message || '密码重置失败，请重试！',
      });
      messageApi.error(error.message || '密码重置失败，请重试！');
    }
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>
          {intl.formatMessage({
            id: 'menu.resetPassword',
            defaultMessage: '重置密码',
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
            maxWidth: 450,
            padding: '32px',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <img
              alt="logo"
              src="/logo.svg"
              style={{ height: 44, marginBottom: 16 }}
            />
            <h2 style={{ marginBottom: 8 }}>重置密码</h2>
            <p style={{ color: '#999', fontSize: 14 }}>请输入验证码和新密码</p>
          </div>

          {resetPasswordState.status === 'error' && (
            <ResetPasswordMessage
              content={resetPasswordState.message || '操作失败，请重试！'}
            />
          )}

          <Form
            form={form}
            onFinish={handleResetPassword}
            layout="vertical"
            size="large"
            initialValues={{ phone: phoneFromUrl }}
          >
            <Form.Item
              name="phone"
              rules={[
                { required: true, message: '请输入手机号！' },
                {
                  pattern: /^1\d{10}$/,
                  message: '手机号格式错误！',
                },
              ]}
            >
              <Input
                prefix={<MobileOutlined />}
                placeholder="请输入手机号"
                maxLength={11}
                disabled={!!phoneFromUrl}
              />
            </Form.Item>

            <Form.Item
              name="captcha"
              rules={[
                { required: true, message: '请输入验证码！' },
                { len: 4, message: '验证码为4位数字' },
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
                      重新获取
                    </Button>
                  )
                }
              />
            </Form.Item>

            <Form.Item
              name="newPassword"
              rules={[
                { required: true, message: '请输入新密码！' },
                { min: 6, message: '密码长度至少6位' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="请输入新密码（至少6位）"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请确认新密码！' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致！'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="请再次输入新密码"
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block>
                重置密码
              </Button>
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
              <Button
                type="link"
                onClick={() => {
                  history.push('/user/forgot-password');
                }}
              >
                返回上一步
              </Button>
              <span style={{ margin: '0 8px' }}>|</span>
              <Button type="link" onClick={() => history.push('/user/login')}>
                返回登录
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ResetPassword;
