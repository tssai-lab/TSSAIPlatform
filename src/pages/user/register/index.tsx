import { LockOutlined, UserOutlined, MobileOutlined } from '@ant-design/icons';
import { FormattedMessage, Helmet, useIntl } from '@umijs/max';
import { Alert, App, Button, Form, Input } from 'antd';
import { createStyles } from 'antd-style';
import React, { useState } from 'react';
import { history } from '@umijs/max';
import { Footer } from '@/components';
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
  const [registerState, setRegisterState] = useState<{ status?: string; message?: string }>({});
  const { styles } = useStyles();
  const { message: messageApi } = App.useApp();
  const intl = useIntl();

  const handleSubmit = async (values: any) => {
    try {
      // TODO: 调用注册接口 POST /api/user/register
      console.log('注册参数:', values);
      messageApi.success('注册成功！');
      // 注册成功后跳转到登录页
      setTimeout(() => {
        history.push('/user/login');
      }, 1000);
    } catch (error) {
      messageApi.error('注册失败，请重试！');
      setRegisterState({
        status: 'error',
        message: '注册失败，请重试！',
      });
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
            <img alt="logo" src="/logo.svg" style={{ height: 44, marginBottom: 16 }} />
            <h2 style={{ marginBottom: 8 }}>注册账号</h2>
            <p style={{ color: '#999', fontSize: 14 }}>创建您的新账号</p>
          </div>

          {status === 'error' && (
            <RegisterMessage content={registerState.message || '注册失败，请重试！'} />
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
                { min: 3, message: '用户名至少3个字符' },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="请输入用户名"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码长度至少6位' },
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
                { pattern: /^1\d{10}$/, message: '手机号格式错误' },
              ]}
            >
              <Input
                prefix={<MobileOutlined />}
                placeholder="手机号（可选）"
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
      <Footer />
    </div>
  );
};

export default Register;



