/**
 * 本地存储工具
 * 对 localStorage 的统一封装，便于维护和扩展
 */
const storage = {
  get<T = string>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch {
      return null;
    }
  },

  set(key: string, value: unknown): void {
    try {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, str);
    } catch (e) {
      console.warn('storage set error:', e);
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('storage remove error:', e);
    }
  },

  clear(): void {
    try {
      localStorage.clear();
    } catch (e) {
      console.warn('storage clear error:', e);
    }
  },
};

export default storage;
