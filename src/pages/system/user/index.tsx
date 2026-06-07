import {
  DeleteOutlined,
  EditOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import {
  Button,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Select,
  Space,
} from 'antd';
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react';
import {
  SYSTEM_ROLE_OPTIONS_NORMAL_ADMIN,
  SYSTEM_ROLE_OPTIONS_SUPER,
  SYSTEM_ROLES,
  SYSTEM_STATUS,
  SYSTEM_STATUS_OPTIONS,
} from '@/constants/systemLabels';
import {
  addUser,
  checkUsername,
  deleteUser,
  editUser,
  fetchUserList as fetchUserListService,
  promoteUserToNormalAdmin,
  toggleUserStatus,
  type UserItem,
  type UserListParams,
} from '@/services/system';
import { toProTableFail, toProTableSuccess, withIndex } from '@/utils/proTable';
import { notifyRequestError } from '../notifyRequestError';

/**
 * 用户管理页
 * 超管：可管理全部用户；可将普通用户指定为普通管理员
 * 普管：仅管理普通用户；无权指定/调整管理员
 */
const UserManagement: React.FC = () => {
  const access = useAccess();
  const [form] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [_usernameChecking, setUsernameChecking] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const actionRef = useRef<ActionType>(null);

  useEffect(() => {
    if (!access.canAccessSystemUser) {
      history.replace('/403');
    }
  }, [access.canAccessSystemUser]);

  /** 新增弹窗打开后重置表单并写入默认值（须在 Modal 内 Form 挂载后调用） */
  useEffect(() => {
    if (modalVisible && !editingUser) {
      form.resetFields();
      form.setFieldsValue({
        status: SYSTEM_STATUS.ENABLED,
        role: SYSTEM_ROLES.USER,
      });
    }
  }, [modalVisible, editingUser, form]);

  if (!access.canAccessSystemUser) return null;

  const isSuperAdmin = access.isSuperAdmin;
  const canDelete = access.canUserDelete;
  const canRoleFilterAndAssignAdmin = access.canUserRoleFilterAndAssignAdmin;

  const fetchUserList = async (
    params: Record<string, unknown>,
    _sort: Record<string, any>,
    _filter: Record<string, any>,
  ) => {
    try {
      const {
        current = 1,
        pageSize = 10,
        username,
        phone,
        role,
        status,
        createTime,
      } = params as {
        current?: number;
        pageSize?: number;
        username?: string;
        phone?: string;
        role?: string;
        status?: string;
        createTime?: string;
      };

      const requestParams: UserListParams = {
        pageNum: current,
        pageSize,
        username: username ?? '',
        phone: phone ?? '',
        role: canRoleFilterAndAssignAdmin ? (role ?? '') : '',
        status: status ?? '',
        createTime: createTime ? dayjs(createTime).format('YYYY-MM-DD') : '',
        currentUserRole: isSuperAdmin ? 'super_admin' : 'normal_admin',
      };

      const response = await fetchUserListService(requestParams);
      if (response.code !== 200) {
        return toProTableFail<UserItem>();
      }
      const list = withIndex(response.data?.list ?? [], current, pageSize);
      return toProTableSuccess(list, response.data?.total ?? 0);
    } catch (_error: unknown) {
      return toProTableFail<UserItem>();
    }
  };

  const handleAdd = () => {
    setEditingUser(null);
    setModalVisible(true);
  };

  const handleEdit = (record: UserItem) => {
    setEditingUser(record);
    form.setFieldsValue({
      id: record.id,
      username: record.username,
      phone: record.phone,
      role: record.role,
      status: record.status,
    });
    setModalVisible(true);
  };

  const validateUsername = async (_: unknown, value: string) => {
    if (!value) return Promise.reject(new Error('用户名不能为空'));
    if (editingUser && value === editingUser.username) return Promise.resolve();
    setUsernameChecking(true);
    try {
      const response = await checkUsername(value);
      setUsernameChecking(false);
      if (response.code === 200 && response.data?.available !== false) {
        return Promise.resolve();
      }
      return Promise.reject(new Error('用户名已存在'));
    } catch (e) {
      setUsernameChecking(false);
      const err = e as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      if (
        err?.response?.data?.message?.includes('已存在') ||
        err?.message?.includes('已存在')
      ) {
        return Promise.reject(new Error('用户名已存在'));
      }
      return Promise.resolve();
    }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const username = values.username as string;
      const phone = values.phone as string;
      const role = values.role as string;
      const status = values.status as string;

      if (editingUser) {
        const submitRole = isEditingSuperAdmin
          ? SYSTEM_ROLES.SUPER_ADMIN
          : role;
        if (
          !canRoleFilterAndAssignAdmin &&
          (submitRole === SYSTEM_ROLES.SUPER_ADMIN ||
            submitRole === SYSTEM_ROLES.NORMAL_ADMIN)
        ) {
          message.error('无权限分配管理员角色');
          return;
        }
        // 用户管理中不允许把非超管提升为“超管”
        if (
          submitRole === SYSTEM_ROLES.SUPER_ADMIN &&
          editingUser.role !== SYSTEM_ROLES.SUPER_ADMIN
        ) {
          message.error('不支持在用户管理中将用户设置为超管');
          return;
        }
        const response = await editUser({
          id: editingUser.id,
          username,
          phone,
          role: submitRole,
          status,
        });
        if (response.code === 200) {
          message.success('编辑成功');
          setModalVisible(false);
          form.resetFields();
          actionRef.current?.reload();
          return;
        }
        message.error(response.message || '编辑失败');
      } else {
        if (
          !canRoleFilterAndAssignAdmin &&
          (role === SYSTEM_ROLES.SUPER_ADMIN ||
            role === SYSTEM_ROLES.NORMAL_ADMIN)
        ) {
          message.error('无权限分配管理员角色');
          return;
        }
        if (role === SYSTEM_ROLES.SUPER_ADMIN) {
          message.error('不支持在用户管理中创建超管账号');
          return;
        }
        const response = await addUser({
          username,
          phone,
          role,
          status,
        });
        if (response.code === 200) {
          message.success('新增成功');
          setModalVisible(false);
          form.resetFields();
          actionRef.current?.reload();
          return;
        }
        message.error(response.message || '新增失败');
      }
    } catch (error: unknown) {
      notifyRequestError(error, '操作失败');
      // BizError 已由 app.tsx 全局 errorHandler 提示
    }
  };

  const handleModalOk = async () => {
    if (submitLoading) return;
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      await handleSubmit(values);
    } catch (error: unknown) {
      const err = error as { errorFields?: unknown[] };
      if (err?.errorFields?.length) {
        message.warning('请完善表单后再提交');
        return;
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async (record: UserItem) => {
    if (!canDelete) {
      message.warning('无权限执行该操作');
      return;
    }
    if (
      record.role === SYSTEM_ROLES.SUPER_ADMIN ||
      record.role === SYSTEM_ROLES.NORMAL_ADMIN
    ) {
      message.warning('敏感操作：删除管理员账号需二次确认');
    }
    try {
      const response = await deleteUser(record.id);
      if (response.code === 200) {
        message.success('删除成功');
        actionRef.current?.reload();
        return;
      }
      message.error(response.message || '删除失败');
    } catch (error: unknown) {
      notifyRequestError(error, '删除失败');
    }
  };

  const handleToggleStatus = async (record: UserItem, newStatus: string) => {
    if (
      record.role === SYSTEM_ROLES.SUPER_ADMIN ||
      record.role === SYSTEM_ROLES.NORMAL_ADMIN
    ) {
      message.warning('敏感操作：禁用管理员账号需二次确认');
    }
    try {
      const response = await toggleUserStatus(record.id, newStatus);
      if (response.code === 200) {
        message.success(
          newStatus === SYSTEM_STATUS.DISABLED ? '已禁用' : '已启用',
        );
        actionRef.current?.reload();
        return;
      }
      message.error(response.message || '状态切换失败');
    } catch (error: unknown) {
      notifyRequestError(error, '状态切换失败');
    }
  };

  const handlePromoteToAdmin = async (record: UserItem) => {
    try {
      const res = await promoteUserToNormalAdmin({ userId: record.id });
      if (res.code === 200) {
        message.success(
          (res as any).msg ?? (res as any).message ?? '已设为普通管理员',
        );
        actionRef.current?.reload();
        return;
      }
      message.error((res as any).message ?? (res as any).msg ?? '操作失败');
    } catch (error: unknown) {
      notifyRequestError(error, '操作失败');
    }
  };

  const isEditingSuperAdmin = editingUser?.role === SYSTEM_ROLES.SUPER_ADMIN;

  const roleOptions = canRoleFilterAndAssignAdmin
    ? SYSTEM_ROLE_OPTIONS_SUPER
    : SYSTEM_ROLE_OPTIONS_NORMAL_ADMIN;

  const roleOptionsForForm = isEditingSuperAdmin
    ? [{ label: SYSTEM_ROLES.SUPER_ADMIN, value: SYSTEM_ROLES.SUPER_ADMIN }]
    : roleOptions;

  const columns: ProColumns<UserItem>[] = [
    {
      title: '序号',
      dataIndex: '_index',
      key: '_index',
      width: 80,
      align: 'center',
      hideInSearch: true,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      align: 'center',
      fieldProps: {
        placeholder: '请输入用户名',
        onPressEnter: () => actionRef.current?.reload(),
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      align: 'center',
      fieldProps: {
        placeholder: '请输入手机号',
        onPressEnter: () => actionRef.current?.reload(),
      },
    },
    ...(canRoleFilterAndAssignAdmin
      ? [
          {
            title: '角色',
            dataIndex: 'role',
            key: 'role',
            align: 'center' as const,
            valueType: 'select' as const,
            valueEnum: {
              [SYSTEM_ROLES.SUPER_ADMIN]: { text: SYSTEM_ROLES.SUPER_ADMIN },
              [SYSTEM_ROLES.NORMAL_ADMIN]: { text: SYSTEM_ROLES.NORMAL_ADMIN },
              [SYSTEM_ROLES.USER]: { text: SYSTEM_ROLES.USER },
            },
            fieldProps: { placeholder: '请选择角色' },
          } as ProColumns<UserItem>,
        ]
      : []),
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      valueType: 'select',
      valueEnum: {
        [SYSTEM_STATUS.ENABLED]: {
          text: SYSTEM_STATUS.ENABLED,
          status: 'Success',
        },
        [SYSTEM_STATUS.DISABLED]: {
          text: SYSTEM_STATUS.DISABLED,
          status: 'Error',
        },
      },
      fieldProps: { placeholder: '请选择状态' },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      align: 'center',
      valueType: 'date',
      search: { transform: (value: string) => ({ createTime: value }) },
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      align: 'center',
      hideInSearch: true,
      render: (_, record) => (
        <Space>
          {isSuperAdmin && record.role === SYSTEM_ROLES.USER && (
            <Popconfirm
              title={`将「${record.username}」设为普通管理员？`}
              description="该用户将获得与普通管理员相同的管理权限（仍低于超级管理员）。"
              okText="确定"
              cancelText="取消"
              onConfirm={() => handlePromoteToAdmin(record)}
            >
              <Button type="link" size="small" icon={<UserSwitchOutlined />}>
                设为管理员
              </Button>
            </Popconfirm>
          )}
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() =>
              handleToggleStatus(
                record,
                record.status === SYSTEM_STATUS.ENABLED
                  ? SYSTEM_STATUS.DISABLED
                  : SYSTEM_STATUS.ENABLED,
              )
            }
          >
            {record.status === SYSTEM_STATUS.ENABLED
              ? SYSTEM_STATUS.DISABLED
              : SYSTEM_STATUS.ENABLED}
          </Button>
          {canDelete && (
            <Popconfirm
              title={`确定删除用户「${record.username}」吗？`}
              description={
                record.role === SYSTEM_ROLES.SUPER_ADMIN ||
                record.role === SYSTEM_ROLES.NORMAL_ADMIN
                  ? '该账号为管理员，删除后不可恢复，请谨慎操作。'
                  : '删除后不可恢复'
              }
              onConfirm={() => handleDelete(record)}
              okText="确认"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="用户管理"
      subTitle="管理平台用户账号，支持搜索筛选、新增/编辑、启用/禁用等操作。"
      extra={
        <Button type="primary" onClick={handleAdd}>
          新增用户
        </Button>
      }
    >
      <ProTable<UserItem>
        actionRef={actionRef}
        columns={columns}
        request={fetchUserList}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
        }}
        toolBarRender={false}
        dateFormatter="string"
      />

      <Modal
        title={editingUser ? `编辑用户 - ${editingUser.username}` : '新增用户'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingUser(null);
        }}
        onOk={handleModalOk}
        confirmLoading={submitLoading}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '用户名不能为空' },
              { validator: validateUsername },
            ]}
            validateTrigger={['onBlur', 'onSubmit']}
          >
            <Input placeholder="请输入用户名" disabled={!!editingUser} />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              { required: true, message: '手机号不能为空' },
              { pattern: /^1\d{10}$/, message: '手机号格式错误' },
            ]}
          >
            <Input placeholder="请输入手机号" maxLength={11} />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              placeholder="请选择角色"
              disabled={isEditingSuperAdmin}
              options={roleOptionsForForm as any}
            />
          </Form.Item>
          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
            initialValue={SYSTEM_STATUS.ENABLED}
          >
            <Select
              placeholder="请选择状态"
              options={SYSTEM_STATUS_OPTIONS as any}
            />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default UserManagement;
