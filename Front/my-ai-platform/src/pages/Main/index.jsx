import { Layout, Menu } from 'antd';
import {
  HistoryOutlined,
  ApartmentOutlined,
  DatabaseOutlined,
  HomeOutlined
} from '@ant-design/icons';
import AppHeader from '../../components/AppHeader';
import './style.css';
import { Outlet,useNavigate,useLocation} from 'react-router-dom';

const { Sider, Content } = Layout;

// 这可以是从路由动态生成的，这里为简化直接定义
const menuItems = [
  { key: 'home',icon: <HomeOutlined />, label: '主页' ,path:'/main'},
  { key: 'history', icon: <HistoryOutlined />, label: '实验记录' ,path:'/main/history'},
  { key: 'models', icon: <ApartmentOutlined />, label: '我的模型' ,path:'/main/models'},
  { key: 'data', icon: <DatabaseOutlined />, label: '我的数据' ,path:'/main/data'},
];


const MainPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const handle = (item) => {
    const targetPath = menuItems.find(i => i.key === item.key).path
    navigate(targetPath)
  }

  const selectedKey = menuItems.find(i => i.path===location.pathname)?.key || 'home'

  return (
    <Layout className="main-layout">
      <AppHeader />
      <Layout>
        <Sider width={200} className="main-sider">
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={(item) => handle(item)}
            style={{ 
              height: '100%', 
              borderRight: 0 ,
              backgroundColor: '#f6f7f9'
            }}
            items={menuItems}
          />
        </Sider>
        <Layout className="main-content-layout">
          <Content className="main-content">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default MainPage;
