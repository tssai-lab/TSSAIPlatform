import { MobileOutlined } from '@ant-design/icons';
import { FormattedMessage, Helmet, history, useIntl } from '@umijs/max';
import { Alert, App, Button, Form, Input } from 'antd';
import { createStyles } from 'antd-style';
import React, { useRef, useState } from 'react';
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

const ForgotPasswordMessage: React.FC<{
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
 * 忘记密码页 - 第一步：输入手机号，发送验证码
 */
const ForgotPassword: React.FC = () => {
  const [form] = Form.useForm();
  const [forgotPasswordState, setForgotPasswordState] = useState<{
    status?: string;
    message?: string;
  }>({});
  const { styles } = useStyles();
  const { message: messageApi } = App.useApp();
  const intl = useIntl();

  // 忘记密码 - 验证手机号并发送验证码
  const handleForgotPassword = async (values: any) => {
    try {
      // 与后端 POST /api/user/sms/code（SmsCodeDTO.mobile）对齐，勿调用 forget/password
      const response = await getFakeCaptcha({
        phone: values.phone,
      });

      if (response.code === 200) {
        messageApi.success(
          (response as any).msg ??
            (response as any).message ??
            '验证码已发送到您的手机，请查收',
        );
        history.push(`/user/reset-password?phone=${values.phone}`);
      } else {
        const errText =
          (response as any).msg ??
          (response as any).message ??
          '验证码发送失败，请重试！';
        setForgotPasswordState({
          status: 'error',
          message: errText,
        });
        messageApi.error(errText);
      }
    } catch (error: any) {
      console.error('忘记密码失败:', error);
      setForgotPasswordState({
        status: 'error',
        message: error.message || '验证码发送失败，请重试！',
      });
      messageApi.error(error.message || '验证码发送失败，请重试！');
    }
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>
          {intl.formatMessage({
            id: 'menu.forgotPassword',
            defaultMessage: '忘记密码',
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
              src="/estun.png"
              style={{ height: 44, marginBottom: 16 }}
            />
            <h2 style={{ marginBottom: 8 }}>忘记密码</h2>
            <p style={{ color: '#999', fontSize: 14 }}>
              请输入手机号，我们将发送验证码到您的手机
            </p>
          </div>

          {forgotPasswordState.status === 'error' && (
            <ForgotPasswordMessage
              content={forgotPasswordState.message || '操作失败，请重试！'}
            />
          )}

          <Form
            form={form}
            onFinish={handleForgotPassword}
            layout="vertical"
            size="large"
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
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block>
                发送验证码
              </Button>
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
              <Button type="link" onClick={() => history.push('/user/login')}>
                返回登录
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
