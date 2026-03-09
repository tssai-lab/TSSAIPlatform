import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, message, Space, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import React, { useState } from 'react';
import { history } from '@umijs/max';
import { uploadDataset } from '@/services/platform';

/**
 * 数据集上传页 - Page 层
 * 调用 Services 层 uploadDataset 接口
 */
const DatasetUpload: React.FC = () => {
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (values: any) => {
    const fileList = (values.files ?? []) as UploadFile[];
    const files = fileList
      .map((f) => f.originFileObj)
      .filter(Boolean) as File[];
    if (!files.length) {
      message.error('请选择要上传的文件');
      return;
    }
    if (!values.name?.trim()) {
      message.error('请输入数据集名称');
      return;
    }
    setUploading(true);
    try {
      await uploadDataset({ name: values.name.trim(), files }, { skipErrorHandler: true });
      message.success('上传成功！');
      history.push('/dataset/list');
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '上传失败，请重试！');
    } finally {
      setUploading(false);
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
            <Button onClick={() => history.push('/dataset/list')} disabled={uploading}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={uploading}>
              提交
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </PageContainer>
  );
};

export default DatasetUpload;






