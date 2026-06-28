/**
 * 图文一致性训练演示页
 * 使用后端预置种子资产，固定 trainingProfile + code/dataset 版本，无需上传 ZIP
 */
import { PageContainer, ProCard } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import { Alert, Button, Descriptions, Form, Input, message, Space } from 'antd';
import React, { useState } from 'react';
import {
  CONSISTENCY_DEMO_PARAMS,
  createConsistencyTask,
} from '@/services/platform';

const ConsistencyDemo: React.FC = () => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res: any = await createConsistencyTask(
        { name: values.name?.trim() || undefined },
        { skipErrorHandler: true },
      );
      if (!res?.success) {
        message.error(res?.errorMessage || '创建训练任务失败');
        return;
      }
      const taskId = res?.data?.id;
      if (!taskId) {
        message.error('创建成功但未返回任务 ID');
        return;
      }
      message.success('训练任务已创建');
      history.push(`/task/detail/${encodeURIComponent(taskId)}`);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || '创建训练任务失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="图文一致性训练演示"
      subTitle="LogReg 融合基线 · 使用后端预置代码/数据种子资产"
      onBack={() => history.push('/task/create')}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="演示说明"
        description="本页面使用后端已入库的种子资产（code ZIP + data ZIP），无需在前端上传文件。提交后将通过 K8s Worker 执行固定 profile 训练命令。"
      />

      <ProCard title="固定训练参数（只读）" style={{ marginBottom: 16 }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="trainingProfile">
            <code>{CONSISTENCY_DEMO_PARAMS.trainingProfile}</code>
          </Descriptions.Item>
          <Descriptions.Item label="codeVersionId">
            <code>{CONSISTENCY_DEMO_PARAMS.codeVersionId}</code>
          </Descriptions.Item>
          <Descriptions.Item label="datasetVersionId">
            <code>{CONSISTENCY_DEMO_PARAMS.datasetVersionId}</code>
          </Descriptions.Item>
          <Descriptions.Item label="hyperParams">
            <code>{JSON.stringify(CONSISTENCY_DEMO_PARAMS.hyperParams)}</code>
          </Descriptions.Item>
        </Descriptions>
      </ProCard>

      <ProCard title="创建演示任务">
        <Form
          form={form}
          layout="vertical"
          initialValues={{ name: 'consistency-fusion-logreg' }}
        >
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="consistency-fusion-logreg" maxLength={128} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" loading={submitting} onClick={handleSubmit}>
                提交并开始训练
              </Button>
              <Button onClick={() => history.push('/task/list')}>返回任务列表</Button>
              <Button onClick={() => history.push('/task/consistency-upload')}>
                改为上传 ZIP 后训练
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </ProCard>
    </PageContainer>
  );
};

export default ConsistencyDemo;
