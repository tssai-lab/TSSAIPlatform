import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import { Button, Form, Input, Modal, message, Popconfirm } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import {
  addRole,
  deleteRole,
  editRole,
  getRoleList,
  type RoleItem,
} from '@/services/system/role';

/**
 * 角色管理页（仅超级管理员可见）
 * 新增/编辑/删除角色、分配权限、角色绑定用户
 */
const RoleManagement: React.FC = () => {
  const access = useAccess();
  const [form] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const actionRef = useRef<ActionType>(null);

  useEffect(() => {
    if (!access.canAccessSystemRole) {
      history.replace('/403');
    }
  }, [access.canAccessSystemRole]);

  if (!access.canAccessSystemRole) return null;

  const fetchList = async (params: {
    current?: number;
    pageSize?: number;
    name?: string;
  }) => {
    const res = await getRoleList({
      pageNum: params.current ?? 1,
      pageSize: params.pageSize ?? 10,
      name: params.name,
    });
    if (res.code !== 200) {
      message.error(res.msg ?? '查询失败');
      return { data: [], success: false, total: 0 };
    }
    const list = (res.data.list ?? []).map((item, index) => ({
      ...item,
      _index: ((params.current ?? 1) - 1) * (params.pageSize ?? 10) + index + 1,
    }));
    return {
      data: list,
      success: true,
      total: res.data.total ?? 0,
    };
  };

  const handleAdd = () => {
    setEditingRole(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: RoleItem) => {
    setEditingRole(record);
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      description: record.description,
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values: {
    code: string;
    name: string;
    description?: string;
  }) => {
    try {
      if (editingRole) {
        const res = await editRole({ id: editingRole.id, ...values });
        if (res.code === 200) {
          message.success('编辑成功');
          setModalVisible(false);
          actionRef.current?.reload();
        } else message.error(res.msg ?? '编辑失败');
      } else {
        const res = await addRole(values);
        if (res.code === 200) {
          message.success('新增成功');
          setModalVisible(false);
          actionRef.current?.reload();
        } else message.error(res.msg ?? '新增失败');
      }
    } catch (e) {
      const err = e as {
        response?: { data?: { msg?: string } };
        message?: string;
      };
      message.error(err?.response?.data?.msg ?? err?.message ?? '操作失败');
    }
  };

  const handleDelete = async (record: RoleItem) => {
    if (record.code === 'super_admin' || record.code === 'normal_admin') {
      message.warning('系统内置角色不可删除');
      return;
    }
    try {
      const res = await deleteRole(record.id);
      if (res.code === 200) {
        message.success('删除成功');
        actionRef.current?.reload();
      } else message.error(res.msg ?? '删除失败');
    } catch (e) {
      const err = e as {
        response?: { data?: { msg?: string } };
        message?: string;
      };
      message.error(err?.response?.data?.msg ?? err?.message ?? '删除失败');
    }
  };

  const columns: ProColumns<RoleItem>[] = [
    {
      title: '序号',
      dataIndex: '_index',
      width: 80,
      align: 'center',
      hideInSearch: true,
    },
    { title: '角色编码', dataIndex: 'code', align: 'center', ellipsis: true },
    {
      title: '角色名称',
      dataIndex: 'name',
      align: 'center',
      fieldProps: { placeholder: '请输入角色名称' },
    },
    {
      title: '描述',
      dataIndex: 'description',
      align: 'center',
      hideInSearch: true,
    },
    {
      title: '用户数',
      dataIndex: 'userCount',
      width: 100,
      align: 'center',
      hideInSearch: true,
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      width: 120,
      align: 'center',
      hideInSearch: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      align: 'center',
      hideInSearch: true,
      render: (_, record) => (
        <>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small">
            分配权限
          </Button>
          {record.code !== 'super_admin' && record.code !== 'normal_admin' && (
            <Popconfirm
              title="确定删除该角色吗？删除后不可恢复。"
              onConfirm={() => handleDelete(record)}
              okText="确认"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          )}
        </>
      ),
    },
  ];

  return (
    <PageContainer
      extra={
        <Button type="primary" onClick={handleAdd}>
          新增角色
        </Button>
      }
    >
      <ProTable<RoleItem>
        actionRef={actionRef}
        columns={columns}
        request={async (params) =>
          fetchList(
            params as { current?: number; pageSize?: number; name?: string },
          )
        }
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
        toolBarRender={false}
      />
      <Modal
        title={editingRole ? `编辑角色 - ${editingRole.name}` : '新增角色'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingRole(null);
        }}
        onOk={() => form.submit()}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item
            name="code"
            label="角色编码"
            rules={[{ required: true, message: '请输入角色编码' }]}
          >
            <Input
              placeholder="如 user、normal_admin"
              disabled={!!editingRole}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="如 普通用户" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="选填" rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default RoleManagement;
