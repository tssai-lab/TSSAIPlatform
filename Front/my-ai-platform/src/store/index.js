import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./slices/userSlice"

// 餐厅老板configureStore 创建餐厅后厨整体store
// reducer是厨师，分配专属灶台
// 负责用户相关厨师的userReducer的专属灶台是userslice
// 
export const store = configureStore({
  reducer: {
    user: userReducer,
  },
});