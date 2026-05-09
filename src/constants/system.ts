/**
 * 系统管理配置常量
 * 避免硬编码，便于维护（与 platform.ts 风格保持一致）
 */
export const SYSTEM_API_CONFIG = {
  BASE_URL: '/api',
  TIMEOUT: 30000,
  ENDPOINTS: {
    USER_LIST: '/system/user/list',
    USER_ADD: '/system/user/add',
    USER_EDIT: '/system/user/edit',
    USER_DELETE: '/system/user/delete',
    USER_TOGGLE_STATUS: '/system/user/toggleStatus',
    USER_CHECK_USERNAME: '/system/user/checkUsername',

    LOG_LIST: '/system/log/list',
    LOG_EXPORT: '/system/log/export',

    CONFIG_GET: '/system/config/get',
    CONFIG_UPDATE: '/system/config/update',
  },
} as const;
