import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import request from '../../utils/request'; // 导入封装的 request
import { message } from 'antd'; // 导入antd message 组件
import { createAction } from '@reduxjs/toolkit';

// 1. 异步登录 Action
export const fetchLogin = createAsyncThunk(
  'user/fetchLogin', // Action 名称（全局唯一，用于调试）
  // async 函数的特性：如果内部 await 的 Promise 是 rejected 状态（比如 Promise.reject(error)），会自动转化为「抛出错误」；
  //所以 fetchLogin 中 const res = await request.post(...) 会直接抛出错误，跳过后续的 console.log(res)、return res.data 等所有代码。    
  async (values) => {
    const res = await request.post('/login', values); 
    console.log(res)// 调用你的登录接口
    return res; // 接口返回的 data（{ token, username }）会传给下面的 fulfilled 回调
  }
);

export const fetchRegister = createAsyncThunk(
    'user/fetchRegister',
    async(values) => {
        const res = await request.post('/register',values);
        console.log(res)
        return res;
    }
)

// 2. 创建 Slice（状态模块）
const userSlice = createSlice({
  name: 'user', // 模块名称（用于生成 Action 类型）
  initialState: { // 初始状态
    username: '', // 用户名（供 Head 组件、Main 页面显示）
    token: '',    // 用户 Token（供接口请求携带）
    isLoading: false, // 登录加载状态（控制按钮禁用）
    
  },
  // 3. 同步 Reducer（直接修改状态，RTK 内置 Immer 支持「可变写法」）
  reducers: {
    // 退出登录：清除状态 + 本地存储
    logout: (state) => {
      state.username = '';
      state.token = '';
      console.log('⚠️ logout 被调用了！');
      localStorage.removeItem('userInfo'); // 清除本地存储兜底
      message.success('退出登录成功');
    },
    // 页面刷新后：从本地存储恢复状态（防止刷新后状态丢失）
    restoreUserInfo: (state) => {
      const userInfoStr = localStorage.getItem('userInfo');
      if (userInfoStr) {
        const { username, token } = JSON.parse(userInfoStr);
        console.log(username, token);
        state.username = username;
        state.token = token;
      }
    },
  },
  // 4. 异步 Reducer（处理 fetchLogin 的三种状态：pending/fulfilled/rejected）
  // action中payload的值===fetch函数返回的内容
  extraReducers: (builder) => {
    builder
      // 登录的三状态
      .addCase(fetchLogin.pending, (state) => {
        state.isLoading = true;
        message.loading('登录中...', 0); 
      })
      .addCase(fetchLogin.fulfilled, (state, action) => {
        state.isLoading = false;
        state.username = action.payload.username; 
        state.token = action.payload.token; 
        localStorage.setItem('userInfo', JSON.stringify(action.payload));
        message.destroy(); 
        message.success('登录成功！');
      })
      .addCase(fetchLogin.rejected, (state, action) => {
        state.isLoading = false;
        message.destroy();
        message.error(action.error.message || '登录失败，请检查账号密码！');
      })
      // 注册的三状态
      .addCase(fetchRegister.pending,(state) =>{
        state.isLoading = true;
        message.loading('注册中...', 0);
      })
      .addCase(fetchRegister.fulfilled,(state,action) =>{
        state.isLoading = false;
        state.username = action.payload.username;
        state.token = action.payload.token;
        localStorage.setItem('userInfo', JSON.stringify(action.payload));
        message.destroy();
        message.success('注册成功！')
      })
      .addCase(fetchRegister.rejected,(state,action) =>{
        state.isLoading = false;
        message.destroy();
        message.error(action.error.message || '注册失败，请检查账号密码！')
      });
  },
});

// 导出同步 Action（供组件调用：退出登录、恢复状态）
export const { logout, restoreUserInfo } = userSlice.actions;

// 导出 Reducer（供 Store 整合）
export default userSlice.reducer;