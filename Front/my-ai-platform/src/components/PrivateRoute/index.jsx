import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';

// 高阶组件：保护需要登录才能访问的路由
const PrivateRoute = () => {
  const { token } = useSelector((state) => state.user);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
};

export default PrivateRoute;