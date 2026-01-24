import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, message, Modal, Form, Input, Select, Popconfirm } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import React, { useState } from 'react';

/**
 * 用户管理页（超管专属）
 */
const UserManagement: React.FC = () => {
  const [form] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  // TODO: 调用接口 GET /api/sys/user/list
  const fetchUserList = async (params: any) => {
    console.log('查询参数:', params);
    return {
      data: [],
      success: true,
      total: 0,
    };
  };

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingUser(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingUser) {
        // TODO: 调用接口 PUT /api/sys/user/edit
        console.log('编辑用户:', values);
      } else {
        // TODO: 调用接口 POST /api/sys/user/add
        console.log('新增用户:', values);
      }
      message.success(editingUser ? '编辑成功' : '新增成功');
      setModalVisible(false);
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleResetPwd = async (userId: string) => {
    try {
      // TODO: 调用接口 POST /api/sys/user/resetPwd
      console.log('重置密码:', userId);
      message.success('密码重置成功');
    } catch (error) {
      message.error('重置失败');
    }
  };

  const columns: ProColumns<API.UserItem>[] = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      valueEnum: {
        admin: { text: '超管' },
        user: { text: '普通用户' },
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      valueType: 'dateTime',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      valueEnum: {
        enabled: { text: '启用' },
        disabled: { text: '禁用' },
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <>
          <Button type="link" onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要重置密码吗？"
            onConfirm={() => handleResetPwd(record.id)}
          >
            <Button type="link">重置密码</Button>
          </Popconfirm>
          <Button type="link">
            {record.status === 'enabled' ? '禁用' : '启用'}
          </Button>
        </>
      ),
    },
  ];

  return (
    <PageContainer
      extra={[
        <Button key="add" type="primary" onClick={handleAdd}>
          新增用户
        </Button>,
      ]}
    >
      <ProTable
        columns={columns}
        request={fetchUserList}
        rowKey="id"
        search={{
          labelWidth: 'auto',
        }}
        pagination={{
          pageSize: 10,
        }}
      />

      <Modal
        title={editingUser ? '编辑用户' : '新增用户'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" disabled={!!editingUser} />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[{ required: true, message: '请输入手机号' }]}
          >
            <Input placeholder="请输入手机号" />
          </Form.Item>
          {!editingUser && (
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          )}
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色">
              <Select.Option value="admin">超管</Select.Option>
              <Select.Option value="user">普通用户</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default UserManagement;






