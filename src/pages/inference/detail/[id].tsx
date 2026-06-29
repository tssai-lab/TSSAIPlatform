import { ReloadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useParams } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  message,
  Popconfirm,
  Space,
  Spin,
  Tag,
} from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  INFERENCE_INPUT_MODE,
  INFERENCE_POLL_INTERVAL_MS,
  INFERENCE_TASK_STATUS,
  INFERENCE_TASK_TYPE,
  INFERENCE_TERMINAL_STATUSES,
  isActiveInferenceStatus,
} from '@/constants/inference/constants';
import { getInferenceDeleteConfirm } from '@/constants/inference/deleteConfirm';
import { getInferenceDeleteSuccessMessage } from '@/constants/inference/mockData';
import { hasInferenceResult } from '@/constants/inference/resultUtils';
import { getInferenceStopConfirm } from '@/constants/inference/stopConfirm';
import {
  deleteInferenceTask,
  fetchInferenceTaskDetail,
  stopInferenceTask,
} from '@/services/platform';
import InferenceDatasetCell from '../components/InferenceDatasetCell';
import InferenceInputFileCell from '../components/InferenceInputFileCell';
import InferenceParamsDisplay from '../components/InferenceParamsDisplay';
import InferenceProgress from '../components/InferenceProgress';
import InferenceTaskId from '../components/InferenceTaskId';
import CvResultPanel from '../components/results/CvResultPanel';
import MultimodalResultPanel from '../components/results/MultimodalResultPanel';
import NlpResultPanel from '../components/results/NlpResultPanel';

const InferenceDetail: React.FC = () => {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : '';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<API.InferenceTaskDetail | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const loadDetail = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!id) return;
      if (!options?.silent) setRefreshing(true);
      try {
        const res = await fetchInferenceTaskDetail(id, {
          skipErrorHandler: true,
        });
        setDetail(res?.data ?? null);
      } catch {
        if (!options?.silent) message.error('加载推理任务失败');
        setDetail(null);
      } finally {
        setLoading(false);
        if (!options?.silent) setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    setLoading(true);
    loadDetail({ silent: true });
  }, [loadDetail]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!detail || INFERENCE_TERMINAL_STATUSES.includes(detail.status))
      return undefined;
    pollRef.current = setInterval(
      () => loadDetail({ silent: true }),
      INFERENCE_POLL_INTERVAL_MS,
    );
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [detail?.status, detail?.id, loadDetail]);

  const handleDelete = async () => {
    if (!detail) return;
    try {
      const res = await deleteInferenceTask(id, { skipErrorHandler: true });
      message.success(getInferenceDeleteSuccessMessage(res.data));
      history.push('/inference/list');
    } catch (error: unknown) {
      const err = error as { message?: string; info?: { message?: string } };
      message.error(err?.info?.message || err?.message || '删除失败');
    }
  };

  const handleStop = async () => {
    if (!detail) return;
    try {
      const res = await stopInferenceTask(id, { skipErrorHandler: true });
      setDetail(res?.data ?? detail);
      message.success('推理任务已停止');
    } catch (error: unknown) {
      const err = error as { message?: string; info?: { message?: string } };
      message.error(err?.info?.message || err?.message || '停止失败');
    }
  };

  const stopConfirm = getInferenceStopConfirm();

  const renderTypeResultPanel = (task: API.InferenceTaskDetail) => {
    const cvProps = {
      inputPreviewUrl: task.inputPreviewUrl,
      result: task.result,
      inputMode: task.inputMode,
    };
    const nlpProps = {
      result: task.result,
      inputMode: task.inputMode,
      inputText: task.inputText,
    };
    const mmProps = {
      ...cvProps,
      prompt: task.prompt,
      pendingAnswer: false,
    };

    switch (task.taskType) {
      case 'CV':
        return <CvResultPanel {...cvProps} />;
      case 'NLP':
        return <NlpResultPanel {...nlpProps} />;
      case 'MULTIMODAL':
        return <MultimodalResultPanel {...mmProps} />;
      default:
        return null;
    }
  };

  const renderResultPanel = () => {
    if (!detail) return null;

    const cvProps = {
      inputPreviewUrl: detail.inputPreviewUrl,
      result: detail.result,
      inputMode: detail.inputMode,
    };
    const nlpProps = {
      result: detail.result,
      inputMode: detail.inputMode,
      inputText: detail.inputText,
    };
    const mmProps = {
      ...cvProps,
      prompt: detail.prompt,
      pendingAnswer: !INFERENCE_TERMINAL_STATUSES.includes(detail.status),
    };

    if (!INFERENCE_TERMINAL_STATUSES.includes(detail.status)) {
      if (
        detail.taskType === 'NLP' &&
        detail.inputMode === 'single' &&
        detail.inputText
      ) {
        return <NlpResultPanel {...nlpProps} />;
      }
      if (detail.taskType === 'MULTIMODAL' && detail.inputMode === 'single') {
        return <MultimodalResultPanel {...mmProps} />;
      }
      if (
        detail.taskType === 'CV' &&
        detail.inputMode === 'single' &&
        detail.inputPreviewUrl
      ) {
        return <CvResultPanel {...cvProps} />;
      }
      return (
        <Alert
          type="info"
          showIcon
          message="推理进行中，完成后将在此展示结果"
        />
      );
    }

    if (detail.status === 'stopped') {
      if (!hasInferenceResult(detail)) {
        return (
          <Alert
            type="info"
            showIcon
            message="暂无可用推理结果"
            description="任务已停止，停止前未产生可预览的结果。可删除该任务，或重新创建推理任务。"
          />
        );
      }
      return (
        <>
          <Alert
            type="info"
            showIcon
            message="部分结果"
            description="以下为停止前已完成的推理结果，可能不完整。若要处理剩余数据，请新建推理任务。"
            style={{ marginBottom: 16 }}
          />
          {renderTypeResultPanel(detail)}
        </>
      );
    }

    if (detail.status === 'failed') {
      if (
        detail.taskType === 'NLP' &&
        detail.inputMode === 'single' &&
        detail.inputText
      ) {
        return <NlpResultPanel {...nlpProps} />;
      }
      if (detail.taskType === 'MULTIMODAL' && detail.inputMode === 'single') {
        return <MultimodalResultPanel {...mmProps} />;
      }
      return null;
    }

    return renderTypeResultPanel(detail);
  };

  if (loading) {
    return (
      <PageContainer>
        <Spin style={{ display: 'block', margin: '80px auto' }} />
      </PageContainer>
    );
  }

  if (!detail) {
    return (
      <PageContainer onBack={() => history.push('/inference/list')}>
        <Alert type="error" message="推理任务不存在" />
      </PageContainer>
    );
  }

  const statusInfo = INFERENCE_TASK_STATUS[detail.status];
  const deleteConfirm = getInferenceDeleteConfirm({
    inputMode: detail.inputMode,
    hasInferenceInput: Boolean(detail.inferenceInputId),
    inferenceInputId: detail.inferenceInputId,
    useCustomScript: detail.useCustomScript,
  });
  const isActive = isActiveInferenceStatus(detail.status);
  const isStopped = detail.status === 'stopped';
  const showProgress = isActive || isStopped;

  return (
    <PageContainer
      title={detail.name}
      subTitle={<InferenceTaskId id={detail.id} copyable />}
      onBack={() => history.push('/inference/list')}
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={refreshing}
            onClick={() => loadDetail()}
          >
            刷新
          </Button>
          {isActive && (
            <Popconfirm
              title={stopConfirm.title}
              description={stopConfirm.description}
              onConfirm={handleStop}
            >
              <Button>停止任务</Button>
            </Popconfirm>
          )}
          <Popconfirm
            title={deleteConfirm.title}
            description={deleteConfirm.description}
            onConfirm={handleDelete}
          >
            <Button danger>删除任务</Button>
          </Popconfirm>
        </Space>
      }
    >
      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="任务 ID">
            <InferenceTaskId id={detail.id} />
          </Descriptions.Item>
          <Descriptions.Item label="任务名称">{detail.name}</Descriptions.Item>
          <Descriptions.Item label="任务类型">
            {INFERENCE_TASK_TYPE[detail.taskType]?.label ?? detail.taskType}
          </Descriptions.Item>
          <Descriptions.Item label="输入方式">
            {INFERENCE_INPUT_MODE[detail.inputMode]?.label ?? detail.inputMode}
          </Descriptions.Item>
          <Descriptions.Item label="模型">
            {detail.modelDisplayName}
          </Descriptions.Item>
          <Descriptions.Item label="数据" span={2}>
            {detail.inputMode === 'batch' ? (
              <InferenceDatasetCell name={detail.inputDisplayName} />
            ) : (
              <InferenceInputFileCell displayName={detail.inputDisplayName} />
            )}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Space size={8} wrap>
              <Tag color={statusInfo?.color}>
                {statusInfo?.label ?? detail.status}
              </Tag>
              {isActive && (
                <Tag color="processing">
                  自动刷新 · {INFERENCE_POLL_INTERVAL_MS / 1000}s
                </Tag>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="提交时间">
            {detail.createdAt}
          </Descriptions.Item>
          {detail.startedAt && (
            <Descriptions.Item label="开始时间">
              {detail.startedAt}
            </Descriptions.Item>
          )}
          {detail.finishedAt && (
            <Descriptions.Item label="结束时间">
              {detail.finishedAt}
            </Descriptions.Item>
          )}
          {detail.remark && (
            <Descriptions.Item label="备注" span={2}>
              {detail.remark}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <InferenceParamsDisplay
        taskType={detail.taskType}
        inferenceParams={detail.inferenceParams}
        useCustomScript={detail.useCustomScript}
        scriptFileName={detail.scriptFileName}
        scriptEntryPoint={detail.scriptEntryPoint}
      />

      {showProgress && (
        <Card
          title={isStopped ? '推理进度（已停止）' : '推理进度'}
          style={{ marginBottom: 16 }}
        >
          <InferenceProgress
            progress={detail.progress}
            progressMessage={detail.progressMessage}
            processedCount={detail.processedCount}
            totalCount={detail.totalCount}
            frozen={isStopped}
          />
        </Card>
      )}

      {detail.status === 'failed' && detail.errorMessage && (
        <Alert
          type="error"
          showIcon
          message="推理失败"
          description={detail.errorMessage}
          style={{ marginBottom: 16 }}
        />
      )}

      {isStopped && (
        <Alert
          type="warning"
          showIcon
          message="任务已停止"
          description={detail.errorMessage || '任务已手动停止'}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card title="推理结果">{renderResultPanel()}</Card>
    </PageContainer>
  );
};

export default InferenceDetail;
