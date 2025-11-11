import { useState } from 'react';
import { Layout, Card, Form, Input, Button, Tabs, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import './style.css';
import { request } from '../../utils/request';
import { useDispatch,useSelector } from 'react-redux';
import { fetchLogin,fetchRegister } from '../../store/slices/userSlice';

const { Content } = Layout;
const LoginPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('login');
  const dispatch = useDispatch();
  const { isLoading} = useSelector(state => state.user)
  const onFinish = async (values) => {
  try {
    let res;
    if (activeTab === 'login') {
      // 调用登录接口（使用封装的 post 方法）
      res = await dispatch(fetchLogin(values));
      console.log(res)
      if(fetchLogin.fulfilled.match(res)){
        navigate('/main')
      }
    } else {
      // 调用注册接口
      res = await dispatch(fetchRegister(values))
      if(fetchRegister.fulfilled.match(res)){
        navigate('/main')
      }
    }
  } catch (error) {
    // 错误已被拦截器处理（显示错误提示）
    console.error('操作失败：', error);
  }
  };

  const LoginForm = (
    <Form name="login" onFinish={onFinish} autoComplete='off'>
        {/* 用户名输入项 */}
      <Form.Item name="username" rules={[{ required: true, message: '请输入用户名!' }]}>
        <Input prefix={<UserOutlined />} placeholder="用户名" />
      </Form.Item>

        {/* 密码输入项 */}
      <Form.Item name="password" rules={[{ required: true, message: '请输入密码!' }]}>
        <Input.Password prefix={<LockOutlined />} placeholder="密码" />
      </Form.Item>

        {/* 登录按钮 */}
      <Form.Item>
        <Button type="primary" htmlType="submit" block disabled={isLoading}>
          登录
        </Button>
      </Form.Item>

    </Form>
  );

  const RegisterForm = (
    <Form name="register" onFinish={onFinish} autoComplete='off'>
        {/* 用户名输入项 */}
      <Form.Item name="username" rules={[{ required: true, message: '请输入用户名!' }]}>
        <Input prefix={<UserOutlined />} placeholder="设置用户名" />
      </Form.Item>

        {/* 密码输入项 */}
      <Form.Item name="password" rules={[{ required: true, message: '请输入密码!' }]}>
        <Input.Password prefix={<LockOutlined />} placeholder="设置密码" />
      </Form.Item>

        {/* 确认密码输入项 */}
       <Form.Item name="confirm" dependencies={['password']} hasFeedback rules={[
          { required: true, message: '请确认您的密码!' },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue('password') === value) {
                return Promise.resolve();
              }
              return Promise.reject(new Error('两次输入的密码不匹配!'));
            },
          }),
        ]}>
        <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
      </Form.Item>

        {/* 注册按钮 */}
      <Form.Item>
        <Button type="primary" htmlType="submit" block disabled={isLoading}>
          注册
        </Button>
      </Form.Item>

    </Form>
  );

  const tabItems = [
    {
      key: 'login',
      label: `账号密码登录`,
      children: LoginForm,
    },
    {
      key: 'register',
      label: `注册账号`,
      children: RegisterForm,
    },
  ];

  return (
    <Layout className="login-layout">
      <AppHeader />
      <Content className="login-content">
        <Card className="login-card">
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} centered />
        </Card>
      </Content>
    </Layout>
  );
};

export default LoginPage;
