import { Layout, Typography,Button } from 'antd';
import { RobotOutlined,LogoutOutlined } from '@ant-design/icons';
import './style.css';
import { useSelector } from 'react-redux';
import { useLocation,useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { logout } from '../../store/slices/userSlice'


const { Header } = Layout;
const { Title } = Typography;

const AppHeader = () => {
  const location = useLocation();
  const currentPath = location.pathname

  const { username } = useSelector(state => state.user)
  const isLogin = !!username
  console.log(isLogin) 

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const handleLogout = () => {
    dispatch(logout()); // 清除 Redux 中 token、username + 本地存储
    navigate('/login'); // 跳转到登录页
  };

  return (
    <Header className="app-header">
      <div className="logo-container">
        <RobotOutlined className="logo-icon" />
        <Title level={4} className="logo-title">AI Platform</Title>
      </div>

      {currentPath!=="/login" && isLogin &&(
        <div className='header-right-container'>
          <div className="user-info-container">
            <Title level={5} className="user-name">你好,{username}</Title>
          </div>
          <div className="logout-container">
            <Button
              type="text" // 文字按钮（无背景，适配导航栏）
              icon={<LogoutOutlined />} 
              onClick={handleLogout}
              className="logout-btn"
            >退出登录</Button>
          </div>
        </div>
      )}
      {/* 这里可以放用户信息、退出按钮等 */}
    </Header>
  );
};

export default AppHeader;
