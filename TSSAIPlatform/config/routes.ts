/**
 * @name umi 的路由配置
 * @description 只支持 path,component,routes,redirect,wrappers,name,icon 的配置
 * @param path  path 只支持两种占位符配置，第一种是动态参数 :id 的形式，第二种是 * 通配符，通配符只能出现路由字符串的最后。
 * @param component 配置 location 和 path 匹配后用于渲染的 React 组件路径。可以是绝对路径，也可以是相对路径，如果是相对路径，会从 src/pages 开始找起。
 * @param routes 配置子路由，通常在需要为多个路径增加 layout 组件时使用。
 * @param redirect 配置路由跳转
 * @param wrappers 配置路由组件的包装组件，通过包装组件可以为当前的路由组件组合进更多的功能。 比如，可以用于路由级别的权限校验
 * @param name 配置路由的标题，默认读取国际化文件 menu.ts 中 menu.xxxx 的值，如配置 name 为 login，则读取 menu.ts 中 menu.login 的取值作为标题
 * @param icon 配置路由的图标，取值参考 https://ant.design/components/icon-cn， 注意去除风格后缀和大小写，如想要配置图标为 <StepBackwardOutlined /> 则取值应为 stepBackward 或 StepBackward，如想要配置图标为 <UserOutlined /> 则取值应为 user 或者 User
 * @doc https://umijs.org/docs/guides/routes
 */
export default [
  {
    path: '/user',
    layout: false,
    routes: [
      {
        name: 'login',
        path: '/user/login',
        component: './user/login',
      },
      {
        name: 'register',
        path: '/user/register',
        component: './user/register',
      },
    ],
  },
  // 资产管理 - 模型
  {
    path: '/model',
    name: '模型管理',
    icon: 'database',
    routes: [
      {
        path: '/model/list',
        name: '模型列表',
        component: './model/list',
      },
      {
        path: '/model/upload',
        name: '上传模型',
        component: './model/upload',
        hideInMenu: true,
      },
      {
        path: '/model/detail/:id',
        name: '模型详情',
        component: './model/detail/[id]',
        hideInMenu: true,
      },
    ],
  },
  // 资产管理 - 数据集
  {
    path: '/dataset',
    name: '数据集管理',
    icon: 'file',
    routes: [
      {
        path: '/dataset/list',
        name: '数据集列表',
        component: './dataset/list',
      },
      {
        path: '/dataset/upload',
        name: '上传数据集',
        component: './dataset/upload',
        hideInMenu: true,
      },
      {
        path: '/dataset/detail/:id',
        name: '数据集详情',
        component: './dataset/detail/[id]',
        hideInMenu: true,
      },
    ],
  },
  // 训练调度
  {
    path: '/task',
    name: '训练调度',
    icon: 'thunderbolt',
    routes: [
      {
        path: '/task/list',
        name: '任务列表',
        component: './task/list',
      },
      {
        path: '/task/create',
        name: '发起训练',
        component: './task/create',
        hideInMenu: true,
      },
      {
        path: '/task/detail/:id',
        name: '训练结果',
        component: './task/detail/[id]',
        hideInMenu: true,
      },
    ],
  },
  // 系统管理
  {
    path: '/system',
    name: '系统管理',
    icon: 'setting',
    access: 'canAdmin',
    routes: [
      {
        path: '/system/user',
        name: '用户管理',
        component: './system/user',
      },
      {
        path: '/system/log',
        name: '审计日志',
        component: './system/log',
      },
      {
        path: '/system/api-doc',
        name: 'API文档',
        component: './system/api-doc',
      },
    ],
  },
  // 首页
  {
    path: '/dashboard',
    name: '首页',
    icon: 'home',
    component: './dashboard',
  },
  // 访问根路径时，重定向到首页（已登录）或登录页（未登录）
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '*',
    layout: false,
    component: './404',
  },
];
