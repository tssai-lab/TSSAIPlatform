import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, message, Select, Upload, Space} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import React from 'react';
import { history } from '@umijs/max';

/**
 * 模型上传页
 */
const ModelUpload: React.FC = () => {
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    try {
      // TODO: 实现分片上传逻辑
      // 1. POST /api/model/upload/init
      // 2. POST /api/model/upload/chunk (循环)
      // 3. POST /api/model/upload/complete
      console.log('上传参数:', values);
      message.success('上传成功！');
      history.push('/model/list');
    } catch (error) {
      message.error('上传失败，请重试！');
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
          rules={[{ required: true, message: '请上传模型文件' }]}
        >
          <Upload
            beforeUpload={() => false}
            maxCount={1}
            accept=".zip"
          >
            <Button icon={<UploadOutlined />}>选择文件（支持拖拽）</Button>
          </Upload>
          <div style={{ marginTop: 8, color: '#999' }}>
            支持 Zip 包，单个文件≤10GB
          </div>
        </Form.Item>
        <Form.Item>
          <Space>
            <Button onClick={() => history.push('/model/list')}>
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

export default ModelUpload;

