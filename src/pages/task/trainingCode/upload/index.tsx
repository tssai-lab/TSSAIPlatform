import { UploadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import type { UploadFile } from 'antd';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  message,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd';
import React, { useState } from 'react';
import {
  CONSISTENCY_TRAINING_PROFILE,
  uploadCodeZip,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';

const PROFILE_DISPLAY_NAME = '图文一致性基线训练';

const TrainingCodeUpload: React.FC = () => {
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    codeVersionId: string;
    approvalStatus?: string;
    storagePath?: string;
    fileName?: string;
  } | null>(null);

  const handleUpload = async () => {
    const values = await form.validateFields();
    const file = (values.file as UploadFile[])?.[0]?.originFileObj as
      | File
      | undefined;
    if (!file) {
      message.warning('请选择训练代码 zip 文件');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      message.error('仅支持 .zip 格式');
      return;
    }

    setUploading(true);
    try {
      const res = await uploadCodeZip(
        {
          file,
          codeName: values.codeName.trim(),
          trainingProfile:
            values.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
          remark: values.remark?.trim(),
        },
        { skipErrorHandler: true },
      );
      if (res?.success === false) {
        message.error(res?.errorMessage || '训练代码上传失败');
        return;
      }
      const data = res?.data;
      if (!data?.codeVersionId) {
        message.error('上传成功但未返回 codeVersionId');
        return;
      }
      setUploadResult({
        codeVersionId: data.codeVersionId,
        approvalStatus: data.approvalStatus,
        storagePath: data.storagePath,
        fileName: data.fileName,
      });
      message.success(`训练代码已上传：${data.codeVersionId}`);
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '训练代码上传失败'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <PageContainer
      title="上传训练代码"
      subTitle="上传 zip 训练代码包，创建 code_asset 与 code_version 记录"
      onBack={() => history.push('/task/code/list')}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="上传说明"
        description="上传后默认处于 PENDING 审核状态。可在列表页执行准入校验；管理员可审核通过后再用于发起训练。"
      />

      {uploadResult ? (
        <>
          <Descriptions
            bordered
            size="small"
            column={1}
            style={{ marginBottom: 16 }}
          >
            <Descriptions.Item label="codeVersionId">
              <Typography.Text copyable code>
                {uploadResult.codeVersionId}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="审核状态">
              <Tag
                color={
                  uploadResult.approvalStatus === 'APPROVED'
                    ? 'success'
                    : 'warning'
                }
              >
                {uploadResult.approvalStatus || 'PENDING'}
              </Tag>
            </Descriptions.Item>
            {uploadResult.fileName && (
              <Descriptions.Item label="文件名">
                {uploadResult.fileName}
              </Descriptions.Item>
            )}
            {uploadResult.storagePath && (
              <Descriptions.Item label="存储路径">
                {uploadResult.storagePath}
              </Descriptions.Item>
            )}
          </Descriptions>
          <Space>
            <Button onClick={() => history.push('/task/code/list')}>
              返回列表
            </Button>
            <Button
              type="primary"
              onClick={() =>
                history.push(
                  `/task/create?codeVersionId=${encodeURIComponent(uploadResult.codeVersionId)}`,
                )
              }
            >
              用于发起训练
            </Button>
            <Button
              onClick={() => {
                setUploadResult(null);
                form.resetFields();
              }}
            >
              继续上传
            </Button>
          </Space>
        </>
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          }}
          style={{ maxWidth: 640 }}
        >
          <Form.Item
            name="codeName"
            label="代码资产名称"
            rules={[{ required: true, message: '请输入代码资产名称' }]}
          >
            <Input placeholder="例如：consistency-train-code" />
          </Form.Item>
          <Form.Item
            name="trainingProfile"
            label="训练方案"
            extra={
              <span>
                当前默认：{PROFILE_DISPLAY_NAME}
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  （{CONSISTENCY_TRAINING_PROFILE}）
                </Typography.Text>
              </span>
            }
          >
            <Select
              options={[
                {
                  value: CONSISTENCY_TRAINING_PROFILE,
                  label: PROFILE_DISPLAY_NAME,
                },
              ]}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注（可选）">
            <Input.TextArea
              rows={3}
              placeholder="说明训练代码用途"
              maxLength={200}
              showCount
            />
          </Form.Item>
          <Form.Item
            name="file"
            label="训练代码 ZIP"
            valuePropName="fileList"
            getValueFromEvent={(e) => e?.fileList ?? []}
            rules={[
              {
                required: true,
                validator: (_, value) => {
                  const list = Array.isArray(value) ? value : [];
                  if (
                    !list.length ||
                    !list.some((item: UploadFile) => item.originFileObj)
                  ) {
                    return Promise.reject(new Error('请选择 zip 文件'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
            extra="仅支持 .zip，须包含与训练方案匹配的入口脚本"
          >
            <Upload accept=".zip" maxCount={1} beforeUpload={() => false}>
              <Button icon={<UploadOutlined />}>选择训练代码 zip</Button>
            </Upload>
          </Form.Item>
          <Space>
            <Button onClick={() => history.push('/task/code/list')}>
              取消
            </Button>
            <Button type="primary" loading={uploading} onClick={handleUpload}>
              上传
            </Button>
          </Space>
        </Form>
      )}
    </PageContainer>
  );
};

export default TrainingCodeUpload;
