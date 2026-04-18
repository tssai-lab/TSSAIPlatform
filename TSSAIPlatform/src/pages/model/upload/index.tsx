import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, message, Progress, Select, Space, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import React, { useState } from 'react';
import { history } from '@umijs/max';
import {
  modelUploadInit,
  modelUploadChunk,
  modelUploadComplete,
} from '@/services/ant-design-pro/model';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB 分片

/**
 * 模型上传页：分片上传到后端，由后端写入 MinIO
 */
const ModelUpload: React.FC = () => {
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  const handleSubmit = async (values: any) => {
    const fileList = (values.file ?? []) as UploadFile[];
    const file = fileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.error('请选择模型文件');
      return;
    }
    setUploading(true);
    setUploadPercent(0);
    try {
      const initRes = await modelUploadInit(
        { fileName: file.name, fileSize: file.size },
        { skipErrorHandler: true },
      );
      const uploadId = initRes?.data?.uploadId;
      if (!uploadId) {
        throw new Error((initRes as any)?.errorMessage ?? '初始化上传失败');
      }
      const chunkSize = initRes?.data?.chunkSize ?? CHUNK_SIZE;
      const totalChunks = Math.ceil(file.size / chunkSize);

      for (let partIndex = 0; partIndex < totalChunks; partIndex++) {
        const start = partIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        await modelUploadChunk(uploadId, partIndex, chunk, { skipErrorHandler: true });
        setUploadPercent(Math.round(((partIndex + 1) / totalChunks) * 100));
      }

      await modelUploadComplete(
        {
          uploadId,
          modelName: values.modelName,
          version: values.version,
          type: values.type,
          remark: values.remark,
        },
        { skipErrorHandler: true },
      );
      message.success('上传成功！模型已存储至 MinIO');
      // 回到列表后触发表格自动刷新（避免用户手动点刷新按钮）
      history.push(`/model/list?refresh=${Date.now()}`);
    } catch (error: any) {
      const msg =
        error?.info?.errorMessage ?? error?.message ?? '上传失败，请重试';
      message.error(msg);
    } finally {
      setUploading(false);
      setUploadPercent(0);
    }
  };

  return (
    <PageContainer
      title="上传模型"
      onBack={() => history.push('/model/list')}
    >
      <Form form={form} onFinish={handleSubmit} layout="vertical">
        <Form.Item
          name="modelName"
          label="模型名称"
          rules={[{ required: true, message: '请输入模型名称' }]}
        >
          <Input placeholder="请输入模型名称" />
        </Form.Item>
        <Form.Item
          name="version"
          label="版本号"
          rules={[{ required: true, message: '请输入版本号' }]}
        >
          <Input placeholder="例如: v1.0.0" />
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
        <Form.Item
          name="remark"
          label="备注"
          rules={[
            { required: true, message: '请输入备注' },
            { max: 200, message: '备注不能超过200字' },
          ]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请输入备注（最多200字）"
            maxLength={200}
            showCount
          />
        </Form.Item>
        <Form.Item
          name="file"
          label="模型文件"
          valuePropName="fileList"
          getValueFromEvent={(e) => {
            const list = e?.fileList ?? [];
            return list;
          }}
          rules={[
            {
              required: true,
              validator: (_, value) => {
                const list = Array.isArray(value) ? value : value?.fileList ?? [];
                if (!list?.length || !list[0].originFileObj) {
                  return Promise.reject(new Error('请上传模型文件'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Upload
            beforeUpload={() => false}
            maxCount={1}
            accept=".zip"
            disabled={uploading}
            onChange={(e) => {
              form.setFieldValue('file', e.fileList ?? []);
            }}
          >
            <Button icon={<UploadOutlined />}>选择文件（支持拖拽）</Button>
          </Upload>
          <div style={{ marginTop: 8, color: '#999' }}>
            支持 Zip 包，单个文件≤10GB；将上传至后端并存储到 MinIO
          </div>
        </Form.Item>
        {uploading && (
          <Form.Item label="上传进度">
            <Progress percent={uploadPercent} status="active" />
          </Form.Item>
        )}
        <Form.Item>
          <Space>
            <Button onClick={() => history.push('/model/list')} disabled={uploading}>
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

export default ModelUpload;

