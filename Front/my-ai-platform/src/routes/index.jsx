import { useRoutes, Navigate } from 'react-router-dom';
import LoginPage from '../pages/Login';
import MainPage from '../pages/Main';
import PrivateRoute from '../components/PrivateRoute'
import HistoryPage from '../components/HistoryCom'
import ModelsCom from '../components/ModelsCom'
import DataCom from '../components/DataCom'
import HomeCom from '../components/HomeCom';

export default function AppRouter() {
  const routes = useRoutes([
    // 公开路由
    {path: '/login',element: <LoginPage />},

    // 受保护路由
    {
      path: '/main', 
      element: <PrivateRoute/>,
      children:[
        {path: '',
         element: <MainPage />,
         children:[
          {path: '', element: <HomeCom />},
          {path: 'history', element: <HistoryPage />},
          {path: 'models', element: <ModelsCom />},
          {path: 'data', element: <DataCom />},
        ]
        }
      ]
    },

    // 重定向
    {
      path: '/',
      element: <Navigate to="/login" replace />, // 默认重定向到登录页
    },
  ]);
  return routes;
}
