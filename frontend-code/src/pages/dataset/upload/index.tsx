import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, message, Space, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import React from 'react';
import { history } from '@umijs/max';

/**
 * 数据集上传页
 */
const DatasetUpload: React.FC = () => {
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    try {
      // TODO: 调用接口 POST /api/dataset/upload
      console.log('上传参数:', values);
      message.success('上传成功！');
      history.push('/dataset/list');
    } catch (error) {
      message.error('上传失败，请重试！');
    }
  };

  return (
    <PageContainer
      title="上传数据集"
      onBack={() => history.push('/dataset/list')}
    >
      <Form form={form} onFinish={handleSubmit} layout="vertical">
        <Form.Item
          name="name"
          label="数据集名称"
          rules={[{ required: true, message: '请输入数据集名称' }]}
        >
          <Input placeholder="请输入数据集名称" />
        </Form.Item>
        <Form.Item name="description" label="描述（可选）">
          <Input.TextArea rows={4} placeholder="请输入描述（可选）" />
        </Form.Item>
        <Form.Item
          name="files"
          label="文件"
          rules={[{ required: true, message: '请上传文件' }]}
        >
          <Upload multiple beforeUpload={() => false}>
            <Button icon={<UploadOutlined />}>选择文件（支持多文件）</Button>
          </Upload>
        </Form.Item>
        <Form.Item>
          <Space>
            <Button onClick={() => history.push('/dataset/list')}>
              取消
            </Button>
            <Button type="primary" htmlType="submit">
              提交
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </PageContainer>
  );
};

export default DatasetUpload;






