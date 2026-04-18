import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, message, Select, Space, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import React from 'react';
import { history } from '@umijs/max';
import type { UploadFile } from 'antd/es/upload/interface';
import { uploadObject } from '@/services/ant-design-pro/files';
import { createDatasetAsset, createDatasetVersion } from '@/services/ant-design-pro/dataset';

/**
 * 数据集上传页
 */
const DatasetUpload: React.FC = () => {
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    try {
      const fileList = (values.files ?? []) as UploadFile[];
      const file = fileList[0]?.originFileObj as File | undefined;
      if (!file) {
        message.error('请选择数据集文件');
        return;
      }

      // 1) 创建数据集资产
      const assetRes = await createDatasetAsset(
        { name: values.name, type: values.type, remark: values.description },
        { skipErrorHandler: true },
      );
      const assetId = assetRes?.data?.id;
      if (!assetId) {
        throw new Error((assetRes as any)?.errorMessage ?? '创建数据集资产失败');
      }

      // 2) 上传文件到 MinIO（objectName 采用可读路径）
      const version = values.version || 'v1';
      const objectName = `datasets/${assetId}/${version}/${file.name}`;
      const uploadRes = await uploadObject(file, objectName, { skipErrorHandler: true });

      // 3) 创建版本记录
      await createDatasetVersion(
        {
          assetId,
          version,
          fileName: file.name,
          storagePath: uploadRes?.data?.objectName ?? objectName,
          sizeBytes: uploadRes?.data?.size ?? file.size,
        },
        { skipErrorHandler: true },
      );

      message.success('上传成功！数据集已存储至 MinIO');
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
        <Form.Item
          name="type"
          label="类型"
          rules={[{ required: true, message: '请选择类型' }]}
        >
          <Select placeholder="请选择类型">
            <Select.Option value="CV">CV</Select.Option>
            <Select.Option value="NLP">NLP</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={4} placeholder="请输入描述（可选）" />
        </Form.Item>
        <Form.Item name="version" label="版本号" initialValue="v1">
          <Input placeholder="例如: v1" />
        </Form.Item>
        <Form.Item
          name="files"
          label="文件"
          valuePropName="fileList"
          getValueFromEvent={(e) => e?.fileList ?? []}
          rules={[
            {
              required: true,
              validator: (_, value) => {
                const list = Array.isArray(value) ? value : value?.fileList ?? [];
                if (!list?.length || !list[0].originFileObj) {
                  return Promise.reject(new Error('请上传文件'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Upload beforeUpload={() => false} maxCount={1} accept=".zip">
            <Button icon={<UploadOutlined />}>选择文件</Button>
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






