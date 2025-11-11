import axios from 'axios';

// 1. 创建 axios 实例，配置基础路径、超时时间等
const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // 从环境变量读取基础路径（推荐）
  timeout: 5000, // 请求超时时间（5秒）
  headers: {
    'Content-Type': 'application/json', // 默认请求头
  },
});

// 2. 请求拦截器：前端发出请求到发送到服务器之前，经过Axios请求拦截器
service.interceptors.request.use(
  (config) => {
    // 从本地存储获取 Token，添加到请求头
    const token = localStorage.getItem('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`; // 后端约定的 Token 格式（如 Bearer + Token）
    }
    return config;
  },
  (error) => {
    // 请求发送前的错误（如参数错误）
    return Promise.reject(error);
  }
);

// 3. 响应拦截器：统一处理后端返回结果、错误
service.interceptors.response.use(
  // 后端返回成功(状态码2xx)则创建response对象
  (response) => {
    const res = response.data;
    console.log(res)
    return res; 
  },
  // 后端返回失败(状态码4xx或5xx)则创建error对象
  (error) => {
    // 错误：格式化错误信息，返回 Promise.reject（关键！）
    console.log(error)
    let errorMsg = '网络错误，请重试';
    if (error.response) {
      // 接口返回错误（如 401、403、500）
      errorMsg = error.response.data?.msg || `请求失败（${error.response.status}）`;
    } else if (error.request) {
      // 无响应（网络断开、超时）
      errorMsg = '请求超时，请检查网络';
    }
    // 给 error 增加 message 属性，供 rejected 分支使用
    error.message = errorMsg;
    // 必须 return Promise.reject，才能让 fetchLogin 进入 rejected
    return Promise.reject(error);
  }
);

// 4. 导出封装后的 get/post 方法（简化组件调用）
export const request = {
  get: (url, params) => service.get(url, { params }),
  post: (url, data) => service.post(url, data),
  put: (url, data) => service.put(url, data),
  delete: (url, params) => service.delete(url, { params }),
};

export default service;