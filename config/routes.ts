export default [
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/user',
    layout: false,
    routes: [
      { name: 'login', path: '/user/login', component: './user/login' },
      {
        name: 'register',
        path: '/user/register',
        component: './user/register',
      },
      {
        name: 'forgotPassword',
        path: '/user/forgot-password',
        component: './user/forgot-password',
      },
      {
        name: 'resetPassword',
        path: '/user/reset-password',
        component: './user/reset-password',
      },
    ],
  },
  {
    path: '/model',
    name: '模型管理',
    icon: 'database',
    routes: [
      { path: '/model/list', name: '模型列表', component: './model/list' },
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
      {
        path: '/dataset/point-cloud',
        name: '点云查看',
        component: './dataset/point-cloud',
      },
    ],
  },
  {
    path: '/task',
    name: '训练调度',
    icon: 'thunderbolt',
    routes: [
      { path: '/task/list', name: '任务列表', component: './task/list' },
      {
        path: '/task/create',
        name: '发起训练',
        component: './task/create',
        hideInMenu: true,
      },
      {
        path: '/task/detail/:id',
        name: '任务详情',
        component: './task/detail/[id]',
        hideInMenu: true,
      },
      {
        path: '/task/compare',
        name: '对比分析',
        component: './task/compare',
        hideInMenu: true,
      },
    ],
  },
  {
    path: '/system',
    name: '系统管理',
    icon: 'setting',
    access: 'isAdmin',
    routes: [
      {
        path: '/system/user',
        name: '用户管理',
        component: './system/user',
        access: 'canAccessSystemUser',
      },
      {
        path: '/system/admin',
        name: '管理员列表',
        component: './system/admin',
        access: 'canAccessSystemAdmin',
      },
      {
        path: '/system/log',
        name: '日志管理',
        component: './system/log',
        access: 'canAccessSystemLog',
      },
      {
        path: '/system/config',
        name: '系统配置',
        component: './system/config',
        access: 'canAccessSystemConfig',
      },
    ],
  },
  {
    path: '/account',
    name: '个人中心',
    icon: 'user',
    access: 'canViewMyOperationLogs',
    routes: [
      {
        path: '/account/my-logs',
        name: '我的日志',
        component: './account/my-logs',
      },
    ],
  },
  { path: '/dashboard', name: '首页', icon: 'home', component: './dashboard' },
  {
    path: '/403',
    name: '无权限',
    layout: false,
    component: './403',
    hideInMenu: true,
  },
  { path: '*', layout: false, component: './404' },
];
