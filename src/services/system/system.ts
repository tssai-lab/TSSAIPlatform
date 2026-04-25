/**
 * 系统管理接口 - Services 层统一导出
 * 按系统管理子模块拆分，此处汇总导出便于 Page 层按需引用
 * @see services/system/user.ts - 用户管理
 * @see services/system/admin.ts - 管理员列表
 * @see services/system/log.ts - 日志管理
 * @see services/system/config.ts - 系统配置
 * @see services/system/typings.ts - 系统管理通用类型
 */

export {
  fetchUserList,
  addUser,
  editUser,
  deleteUser,
  toggleUserStatus,
  checkUsername,
  type CurrentUserRoleForApi,
  type UserListParams,
  type UserListResponse,
  type UserItem,
  type AddUserParams,
  type EditUserParams,
  type CommonResponse as SystemCommonResponse,
} from './user';

export {
  fetchAdminList,
  addAdmin,
  editAdmin,
  deleteAdmin,
  toggleAdminStatus,
  checkAdminUsername,
  ADMIN_ROLE_NAMES,
  type AdminRoleName,
  type AdminItem,
  type AdminListParams,
  type AdminListResponse,
} from './admin';

export {
  fetchLogList,
  exportLog,
  type LogListParams,
  type LogListResponse,
  type LogItem,
  type CommonResponse as LogCommonResponse,
} from './log';

export {
  fetchSystemConfig,
  updateSystemConfig,
  type SystemConfig,
  type PasswordPolicy,
} from './config';

export {
  type RoleCode,
  type LogType,
  type LogOperator,
} from './typings';

