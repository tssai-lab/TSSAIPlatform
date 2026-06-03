/**
 * 系统管理配置常量
 * 避免硬编码，便于维护
 */
export const SYSTEM_API_CONFIG = {
  ENDPOINTS: {
    USER_LIST: '/system/user/list',
    USER_ADD: '/system/user/add',
    USER_EDIT: '/system/user/edit',
    USER_DELETE: '/system/user/delete',
    USER_TOGGLE_STATUS: '/system/user/toggleStatus',
    USER_CHECK_USERNAME: '/system/user/checkUsername',
    /** 将普通用户晋升为普通管理员（仅超管） */
    USER_PROMOTE_TO_ADMIN: '/user/promote-to-admin',

    /** 操作日志 §6.3 */
    LOG_QUERY: '/log/query',
    /** 操作类型字典 §6.4 */
    LOG_OPERATION_TYPES: '/log/types',

    /** 系统配置（待与后端确认接口后对接） */
    CONFIG_GET: '/system/config/get',
    CONFIG_UPDATE: '/system/config/update',
  },
} as const;
