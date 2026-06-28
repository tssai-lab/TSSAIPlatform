/**
 * 图文一致性训练：上传 code/data ZIP 后发起 profile 训练
 */
import { PageContainer, ProCard } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import type { UploadFile } from 'antd';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  message,
  Progress,
  Space,
  Steps,
  Tag,
  Typography,
  Upload,
} from 'antd';
import React, { useMemo, useState } from 'react';
import {
  approveCodeVersion,
  CONSISTENCY_TRAINING_PROFILE,
  createProfileTrainingTask,
  uploadCodeZip,
  uploadDataset,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';

function resolveDatasetVersionId(data: any): string | undefined {
  return data?.datasetVersionId || data?.id || data?.versionId;
}

function approvalTag(status?: string) {
  if (status === 'APPROVED') {
    return <Tag color="success">APPROVED</Tag>;
  }
  if (status === 'PENDING') {
    return <Tag color="warning">PENDING</Tag>;
  }
  return <Tag>{status || '未知'}</Tag>;
}

const ConsistencyUploadTrain: React.FC = () => {
  const access = useAccess();
  const [currentStep, setCurrentStep] = useState(0);
  const [codeFileList, setCodeFileList] = useState<UploadFile[]>([]);
  const [dataFileList, setDataFileList] = useState<UploadFile[]>([]);
  const [codeUploading, setCodeUploading] = useState(false);
  const [dataUploading, setDataUploading] = useState(false);
  const [trainSubmitting, setTrainSubmitting] = useState(false);
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [codeProgress, setCodeProgress] = useState(0);
  const [dataProgress, setDataProgress] = useState(0);
  const [codeResult, setCodeResult] = useState<any>(null);
  const [dataResult, setDataResult] = useState<any>(null);
  const [form] = Form.useForm();

  const codeVersionId = codeResult?.codeVersionId as string | undefined;
  const approvalStatus = codeResult?.approvalStatus as string | undefined;
  const isApproved = approvalStatus === 'APPROVED';
  const datasetVersionId = useMemo(
    () => resolveDatasetVersionId(dataResult),
    [dataResult],
  );

  const uploadCode = async () => {
    const file = codeFileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.warning('请选择 consistency_test_code.zip');
      return;
    }
    const values = await form.validateFields(['codeName', 'codeVersion']);
    setCodeUploading(true);
    setCodeProgress(10);
    try {
      const res: any = await uploadCodeZip(
        {
          file,
          codeName: values.codeName,
          version: values.codeVersion || 'v1',
          trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          remark: 'frontend upload consistency code',
        },
        { skipErrorHandler: true },
      );
      if (!res?.success) {
        message.error(res?.errorMessage || '代码包上传失败');
        return;
      }
      setCodeResult(res.data);
      setCodeProgress(100);
      message.success(`代码包上传成功：${res.data.codeVersionId}`);
      setCurrentStep(1);
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '代码包上传失败'));
    } finally {
      setCodeUploading(false);
    }
  };

  const approveCode = async () => {
    if (!codeVersionId) {
      message.warning('请先上传代码包');
      return;
    }
    setApproveSubmitting(true);
    try {
      const res: any = await approveCodeVersion(codeVersionId, {
        skipErrorHandler: true,
      });
      if (!res?.success) {
        message.error(res?.errorMessage || '审核失败');
        return;
      }
      setCodeResult((prev: any) => ({
        ...prev,
        approvalStatus: res.data.approvalStatus,
      }));
      message.success('代码版本已审核通过');
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '审核失败'));
    } finally {
      setApproveSubmitting(false);
    }
  };

  const uploadData = async () => {
    const file = dataFileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.warning('请选择 consistency_test_data.zip');
      return;
    }
    const values = await form.validateFields(['datasetName', 'datasetVersion']);
    setDataUploading(true);
    setDataProgress(0);
    try {
      const res: any = await uploadDataset(
        {
          name: values.datasetName,
          version: values.datasetVersion || 'v1',
          type: 'NLP',
          remark: 'frontend upload consistency data',
          files: [file],
          onProgress: (percent) => setDataProgress(percent),
        },
        { skipErrorHandler: true },
      );
      const versionId = resolveDatasetVersionId(res?.data);
      if (!versionId) {
        message.error('数据集上传成功但未返回 datasetVersionId');
        return;
      }
      setDataResult(res.data);
      setDataProgress(100);
      message.success(`数据集上传成功：${versionId}`);
      setCurrentStep(2);
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '数据集上传失败'));
    } finally {
      setDataUploading(false);
    }
  };

  const startTraining = async () => {
    if (!codeVersionId || !datasetVersionId) {
      message.warning('请先完成 code 与 data 上传');
      return;
    }
    if (!isApproved) {
      message.warning('代码版本未审核通过，不能用于训练');
      return;
    }
    const values = await form.validateFields(['taskName']);
    setTrainSubmitting(true);
    try {
      const res: any = await createProfileTrainingTask(
        {
          name: values.taskName,
          codeVersionId,
          datasetVersionId,
          trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          hyperParams: {},
        },
        { skipErrorHandler: true },
      );
      if (!res?.success) {
        message.error(res?.errorMessage || '创建训练任务失败');
        return;
      }
      const taskId = res?.data?.id;
      if (!taskId) {
        message.error('创建成功但未返回 taskId');
        return;
      }
      message.success('训练任务已创建');
      history.push(`/task/detail/${encodeURIComponent(taskId)}`);
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '创建训练任务失败'));
    } finally {
      setTrainSubmitting(false);
    }
  };

  const codeSummary = codeResult ? (
    <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
      <Descriptions.Item label="codeVersionId">
        <Typography.Text copyable code>
          {codeResult.codeVersionId}
        </Typography.Text>
      </Descriptions.Item>
      <Descriptions.Item label="approvalStatus">
        {approvalTag(codeResult.approvalStatus)}
      </Descriptions.Item>
      <Descriptions.Item label="MinIO">{codeResult.storagePath}</Descriptions.Item>
      {access.isAdmin && !isApproved && (
        <Descriptions.Item label="审核">
          <Button
            type="primary"
            size="small"
            loading={approveSubmitting}
            onClick={approveCode}
          >
            审核通过（测试）
          </Button>
        </Descriptions.Item>
      )}
    </Descriptions>
  ) : null;

  return (
    <PageContainer
      title="图文一致性训练（上传 ZIP）"
      subTitle="先上传 code.zip 与 data.zip，再发起固定 profile 训练"
      onBack={() => history.push('/task/create')}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="本流程使用拆分后的 ZIP"
        description="请分别上传 consistency_test_code.zip 与 consistency_test_data.zip。代码上传后默认为 PENDING，需管理员审核通过后才能创建训练任务。"
      />

      <Steps
        current={currentStep}
        style={{ marginBottom: 24 }}
        items={[
          { title: '上传 code.zip' },
          { title: '上传 data.zip' },
          { title: '创建训练任务' },
        ]}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          codeName: 'consistency_test_code',
          codeVersion: 'v1',
          datasetName: 'consistency_test_data',
          datasetVersion: 'v1',
          taskName: 'consistency-upload-train',
        }}
      >
        {currentStep === 0 && (
          <ProCard title="步骤 1：上传代码 ZIP">
            <Form.Item name="codeName" label="代码资产名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="codeVersion" label="版本号" rules={[{ required: true }]}>
              <Input placeholder="v1" />
            </Form.Item>
            <Form.Item label="代码 ZIP 文件" required>
              <Upload
                accept=".zip"
                maxCount={1}
                fileList={codeFileList}
                beforeUpload={() => false}
                onChange={({ fileList }) => setCodeFileList(fileList.slice(-1))}
              >
                <Button>选择 consistency_test_code.zip</Button>
              </Upload>
            </Form.Item>
            {codeUploading && <Progress percent={codeProgress} style={{ marginBottom: 12 }} />}
            <Button type="primary" loading={codeUploading} onClick={uploadCode}>
              上传代码包
            </Button>
          </ProCard>
        )}

        {currentStep === 1 && (
          <ProCard title="步骤 2：上传数据 ZIP">
            {codeSummary}
            <Form.Item name="datasetName" label="数据集名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="datasetVersion" label="版本号" rules={[{ required: true }]}>
              <Input placeholder="v1" />
            </Form.Item>
            <Form.Item label="数据 ZIP 文件" required>
              <Upload
                accept=".zip"
                maxCount={1}
                fileList={dataFileList}
                beforeUpload={() => false}
                onChange={({ fileList }) => setDataFileList(fileList.slice(-1))}
              >
                <Button>选择 consistency_test_data.zip</Button>
              </Upload>
            </Form.Item>
            {dataUploading && <Progress percent={dataProgress} style={{ marginBottom: 12 }} />}
            <Space>
              <Button onClick={() => setCurrentStep(0)}>上一步</Button>
              <Button type="primary" loading={dataUploading} onClick={uploadData}>
                上传数据集
              </Button>
            </Space>
          </ProCard>
        )}

        {currentStep === 2 && (
          <ProCard title="步骤 3：创建训练任务">
            <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="trainingProfile">
                <code>{CONSISTENCY_TRAINING_PROFILE}</code>
              </Descriptions.Item>
              <Descriptions.Item label="codeVersionId">
                <Typography.Text copyable code>
                  {codeVersionId}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="approvalStatus">
                {approvalTag(approvalStatus)}
              </Descriptions.Item>
              <Descriptions.Item label="datasetVersionId">
                <Typography.Text copyable code>
                  {datasetVersionId}
                </Typography.Text>
              </Descriptions.Item>
              {dataResult?.storagePath && (
                <Descriptions.Item label="data MinIO">
                  {dataResult.storagePath}
                </Descriptions.Item>
              )}
            </Descriptions>
            {!isApproved && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="代码版本未审核通过"
                description={
                  access.isAdmin
                    ? '请点击下方「审核通过（测试）」后再创建训练任务。'
                    : '请联系管理员审核代码版本后再创建训练任务。'
                }
                action={
                  access.isAdmin ? (
                    <Button
                      size="small"
                      type="primary"
                      loading={approveSubmitting}
                      onClick={approveCode}
                    >
                      审核通过（测试）
                    </Button>
                  ) : undefined
                }
              />
            )}
            <Form.Item name="taskName" label="任务名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Space>
              <Button onClick={() => setCurrentStep(1)}>上一步</Button>
              <Button
                type="primary"
                loading={trainSubmitting}
                disabled={!isApproved}
                onClick={startTraining}
              >
                创建并开始训练
              </Button>
            </Space>
          </ProCard>
        )}
      </Form>
    </PageContainer>
  );
};

export default ConsistencyUploadTrain;
