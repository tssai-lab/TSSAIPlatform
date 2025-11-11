import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN'; // 引入中文语言包
import AppRouter from './routes';

function App() {

  return (
    // ConfigProvider 用于全局配置，比如国际化
    <ConfigProvider locale={zhCN}>
      <AppRouter />
    </ConfigProvider>
  );
}

export default App;
