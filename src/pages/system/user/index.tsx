import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
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
  addUser,
  checkUsername,
  deleteUser,
  editUser,
  getUserList,
  toggleUserStatus,
  type UserItem,
  type UserListParams,
} from '@/services/system/user';

/** 角色选项：超管可见全部；普管仅能分配非管理员角色 */
const ROLE_OPTIONS_SUPER = [
  { label: '超管', value: '超管' },
  { label: '普通管理员', value: '普通管理员' },
  { label: '普通用户', value: '普通用户' },
];
const ROLE_OPTIONS_NORMAL_ADMIN = [{ label: '普通用户', value: '普通用户' }];

/**
 * 用户管理页
 * 超管：全部用户、删除/导出/角色筛选等
 * 普管：仅普通用户、无删除导出、仅编辑/启用禁用/重置密码
 */
const UserManagement: React.FC = () => {
  const access = useAccess();
  const [form] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const actionRef = useRef<ActionType>(null);

  useEffect(() => {
    if (!access.canAccessSystemUser) {
      history.replace('/403');
    }
  }, [access.canAccessSystemUser]);

  if (!access.canAccessSystemUser) return null;

  const isSuperAdmin = access.isSuperAdmin;
  const canDeleteOrExport = access.canUserDeleteOrExport;
  const canRoleFilterAndAssignAdmin = access.canUserRoleFilterAndAssignAdmin;

  const fetchUserList = async (
    params: Record<string, unknown>,
    _sort: Record<string, string>,
    _filter: Record<string, unknown>,
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

      const response = await getUserList(requestParams);

      if (response.code === 200) {
        const list = (response.data?.list ?? []).map(
          (item: UserItem, index: number) => ({
            ...item,
            _index: (current! - 1) * pageSize! + index + 1,
          }),
        );
        return {
          data: list,
          success: true,
          total: response.data?.total ?? 0,
        };
      }
      message.error(response.msg ?? '查询失败');
      return { data: [], success: false, total: 0 };
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { msg?: string } };
        message?: string;
      };
      message.error(err?.response?.data?.msg ?? err?.message ?? '查询失败');
      return { data: [], success: false, total: 0 };
    }
  };

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ status: '启用' });
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
      if (response.code === 200) return Promise.resolve();
      return Promise.reject(new Error('用户名已存在'));
    } catch (e) {
      setUsernameChecking(false);
      const err = e as {
        response?: { data?: { msg?: string } };
        message?: string;
      };
      if (
        err?.response?.data?.msg?.includes('已存在') ||
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
        const response = await editUser({
          id: editingUser.id,
          username,
          phone,
          role,
          status,
        });
        if (response.code === 200) {
          message.success('编辑成功');
          setModalVisible(false);
          form.resetFields();
          actionRef.current?.reload();
        } else {
          message.error(response.msg ?? '编辑失败');
        }
      } else {
        if (
          !canRoleFilterAndAssignAdmin &&
          (role === '超管' || role === '普通管理员')
        ) {
          message.error('无权限分配管理员角色');
          return;
        }
        const response = await addUser({ username, phone, role, status });
        if (response.code === 200) {
          message.success('新增成功');
          setModalVisible(false);
          form.resetFields();
          actionRef.current?.reload();
        } else {
          message.error(response.msg ?? '新增失败');
        }
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      message.error(err?.message ?? '操作失败');
    }
  };

  const handleDelete = async (record: UserItem) => {
    if (!canDeleteOrExport) {
      message.warning('无权限执行该操作');
      return;
    }
    if (record.role === '超管' || record.role === '普通管理员') {
      message.warning('敏感操作：删除管理员账号需二次确认');
    }
    try {
      const response = await deleteUser(record.id);
      if (response.code === 200) {
        message.success('删除成功');
        actionRef.current?.reload();
      } else {
        message.error(response.msg ?? '删除失败');
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      message.error(err?.message ?? '删除失败');
    }
  };

  const handleToggleStatus = async (record: UserItem, newStatus: string) => {
    if (record.role === '超管' || record.role === '普通管理员') {
      message.warning('敏感操作：禁用管理员账号需二次确认');
    }
    try {
      const response = await toggleUserStatus(record.id, newStatus);
      if (response.code === 200) {
        message.success(newStatus === '启用' ? '已启用' : '已禁用');
        actionRef.current?.reload();
      } else {
        message.error(response.msg ?? '操作失败');
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      message.error(err?.message ?? '操作失败');
    }
  };

  const handleExport = () => {
    if (!canDeleteOrExport) {
      message.warning('无权限执行该操作');
      return;
    }
    message.info('导出功能需对接后端接口');
  };

  const roleOptions = canRoleFilterAndAssignAdmin
    ? ROLE_OPTIONS_SUPER
    : ROLE_OPTIONS_NORMAL_ADMIN;

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
              超管: { text: '超管' },
              普通管理员: { text: '普通管理员' },
              普通用户: { text: '普通用户' },
            },
            fieldProps: { placeholder: '请选择角色' },
          } as ProColumns<UserItem>[number],
        ]
      : []),
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      valueType: 'select',
      valueEnum: {
        启用: { text: '启用', status: 'Success' },
        禁用: { text: '禁用', status: 'Error' },
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
                record.status === '启用' ? '禁用' : '启用',
              )
            }
          >
            {record.status === '启用' ? '禁用' : '启用'}
          </Button>
          {canDeleteOrExport && (
            <Popconfirm
              title={`确定删除用户「${record.username}」吗？`}
              description={
                record.role === '超管' || record.role === '普通管理员'
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
    <>
      <PageContainer
        extra={
          <Space>
            <Button type="primary" onClick={handleAdd}>
              新增用户
            </Button>
            {canDeleteOrExport && (
              <Button onClick={handleExport}>导出用户</Button>
            )}
          </Space>
        }
      >
        <ProTable<UserItem>
          actionRef={actionRef}
          columns={columns}
          request={fetchUserList}
          rowKey="id"
          search={{ labelWidth: 'auto', defaultCollapsed: false }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
          }}
          toolBarRender={false}
          dateFormatter="string"
        />

        <Modal
          title={
            editingUser ? `编辑用户 - ${editingUser.username}` : '新增用户'
          }
          open={modalVisible}
          onCancel={() => {
            setModalVisible(false);
            form.resetFields();
            setEditingUser(null);
          }}
          onOk={() => form.submit()}
          okText="确定"
          cancelText="取消"
          destroyOnClose
        >
          <Form
            form={form}
            onFinish={handleSubmit}
            layout="vertical"
            preserve={false}
          >
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ validator: validateUsername }]}
              validateTrigger="onBlur"
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
              <Select placeholder="请选择角色" options={roleOptions} />
            </Form.Item>
            <Form.Item
              name="status"
              label="状态"
              rules={[{ required: true, message: '请选择状态' }]}
              initialValue="启用"
            >
              <Select
                placeholder="请选择状态"
                options={[
                  { label: '启用', value: '启用' },
                  { label: '禁用', value: '禁用' },
                ]}
              />
            </Form.Item>
          </Form>
        </Modal>
      </PageContainer>
    </>
  );
};

export default UserManagement;
