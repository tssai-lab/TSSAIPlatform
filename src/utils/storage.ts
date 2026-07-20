// 存储工具：统一处理token等持久化数据
export const storage = {
  set<T = any>(key: string, data: T): void {
    localStorage.setItem(key, JSON.stringify(data));
  },

  get<T = any>(key: string): T | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  remove(key: string): void {
    localStorage.removeItem(key);
  },

  clear(): void {
    localStorage.clear();
  },
};

// 存储键常量：统一管理所有存储键
export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER_INFO: 'USER_INFO',
  /** 训练代码管理员审核开关（与系统配置同步的前端缓存） */
  TRAINING_CODE_REVIEW_CONFIG: 'TRAINING_CODE_REVIEW_CONFIG',
};
