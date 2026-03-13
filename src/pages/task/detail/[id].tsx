/**
 * 训练结果详情页 - Page 层
 * 任务信息、训练指标可视化（从 MLflow 获取）、结果文件列表
 * @see MLflow训练指标对接说明.md
 */
import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Input, List, message, Spin, Tag } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { history, useParams } from '@umijs/max';
import * as echarts from 'echarts';
import { fetchTaskDetail, fetchMlflowMetricsBulk } from '@/services/platform';
import { MOCK_TASK_DETAIL } from '@/constants/mockData';

/** 任务详情扩展类型 */
type TaskDetailInfo = API.TaskItem & {
  completeTime?: string;
  duration?: string;
  metrics?: { accuracy?: string; loss?: string; epochs?: string; batchSize?: string };
  files?: { name: string; desc: string }[];
};

const METRIC_LABELS: Record<string, string> = {
  train_loss: '训练损失',
  val_accuracy: '验证准确率',
  val_mAP50: '验证 mAP50',
  val_mAP50_95: '验证 mAP50-95',
  box_loss: '边界框损失',
  cls_loss: '分类损失',
  dfl_loss: '分布焦点损失',
};

const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [taskInfo, setTaskInfo] = useState<TaskDetailInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [runIdInput, setRunIdInput] = useState('');
  const [manualRunId, setManualRunId] = useState('');
  const [metricsData, setMetricsData] = useState<Record<string, { step: number; value: number }[]>>({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const runId = taskInfo?.runId || manualRunId;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchTaskDetail(id, { skipErrorHandler: true })
      .then((res) => {
        if (res?.data) {
          const data = res.data as TaskDetailInfo;
          data.runId = data.runId || (res.data as any).run_id;
          setTaskInfo(data);
        } else {
          setTaskInfo(MOCK_TASK_DETAIL as TaskDetailInfo);
        }
      })
      .catch(() => {
        setTaskInfo(MOCK_TASK_DETAIL as TaskDetailInfo);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!runId) return;
    setMetricsLoading(true);
    fetchMlflowMetricsBulk(runId)
      .then((data) => {
        setMetricsData(data);
      })
      .catch(() => {
        setMetricsData({});
      })
      .finally(() => setMetricsLoading(false));
  }, [runId]);

  useEffect(() => {
    if (!chartRef.current || !Object.keys(metricsData).length) return;

    const series = Object.entries(metricsData)
      .filter(([, points]) => points.length > 0)
      .map(([key, points]) => ({
        name: METRIC_LABELS[key] || key,
        type: 'line',
        smooth: true,
        data: points.map((p) => [p.step, p.value]),
      }));

    if (series.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    chartInstance.current.setOption({
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { type: 'value', name: 'Step' },
      yAxis: { type: 'value', name: 'Value' },
      series,
    });
  }, [metricsData]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  const handleLoadByRunId = () => {
    const rid = runIdInput.trim();
    if (!rid) {
      message.warning('请输入 Run ID');
      return;
    }
    setManualRunId(rid);
  };

  if (loading) {
    return (
      <PageContainer title="训练结果详情" onBack={() => history.push('/task/list')}>
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!taskInfo) return null;

  const hasCharts = Object.values(metricsData).some((arr) => arr.length > 0);

  return (
    <PageContainer
      title="训练结果详情"
      subTitle="查看训练任务的详细信息和 MLflow 训练指标"
      onBack={() => history.push('/task/list')}
      extra={<Button onClick={() => history.push('/task/list')}>返回列表</Button>}
    >
      <Card title="任务信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="任务名称">
            <strong>{taskInfo.name}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="模型">{taskInfo.modelName}</Descriptions.Item>
          <Descriptions.Item label="数据集">{taskInfo.datasetName}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{taskInfo.createTime}</Descriptions.Item>
          <Descriptions.Item label="完成时间">{taskInfo.completeTime || '-'}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag
              color={
                taskInfo.status === 'success'
                  ? 'success'
                  : taskInfo.status === 'running'
                    ? 'processing'
                    : taskInfo.status === 'failed'
                      ? 'error'
                      : 'default'
              }
            >
              {taskInfo.status === 'success'
                ? '成功'
                : taskInfo.status === 'running'
                  ? '运行中'
                  : taskInfo.status === 'failed'
                    ? '失败'
                    : taskInfo.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="总耗时">{taskInfo.duration || '-'}</Descriptions.Item>
          {runId && (
            <Descriptions.Item label="MLflow Run ID" span={2}>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{runId}</span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card
        title="训练指标可视化"
        extra={
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>
            数据来自独立 MLflow 服务，需启动 mlflow server 并写入指标
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        {!runId ? (
          <div style={{ padding: 24, background: '#fafafa', borderRadius: 8 }}>
            <div style={{ marginBottom: 12, color: '#8c8c8c' }}>
              任务详情未包含 run_id，或后端尚未返回。可手动输入 MLflow Run ID 进行联调：
            </div>
            <Input.Search
              placeholder="输入 MLflow Run ID（如 abc123...）"
              value={runIdInput}
              onChange={(e) => setRunIdInput(e.target.value)}
              onSearch={handleLoadByRunId}
              enterButton="加载指标"
              style={{ maxWidth: 480 }}
            />
          </div>
        ) : (
          <>
            {metricsLoading ? (
              <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin size="large" />
              </div>
            ) : hasCharts ? (
              <div ref={chartRef} style={{ height: 400, width: '100%' }} />
            ) : (
              <div
                style={{
                  height: 400,
                  background: '#fafafa',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#8c8c8c',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, marginBottom: 8 }}>暂无指标数据</div>
                  <div style={{ fontSize: 12 }}>
                    请确保 MLflow 服务已启动，且该 run_id 下已写入 metrics（如 train_loss、val_accuracy）
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {taskInfo.metrics && (
          <div
            style={{
              marginTop: 24,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            {taskInfo.metrics.accuracy && (
              <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
                <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>最终准确率</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{taskInfo.metrics.accuracy}</div>
              </div>
            )}
            {taskInfo.metrics.loss && (
              <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
                <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>最终损失值</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{taskInfo.metrics.loss}</div>
              </div>
            )}
            {taskInfo.metrics.epochs && (
              <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
                <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>训练轮数</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{taskInfo.metrics.epochs}</div>
              </div>
            )}
            {taskInfo.metrics.batchSize && (
              <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
                <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>批次大小</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{taskInfo.metrics.batchSize}</div>
              </div>
            )}
          </div>
        )}
      </Card>

      {taskInfo.files && taskInfo.files.length > 0 && (
        <Card title="结果文件">
          <List
            dataSource={taskInfo.files}
            renderItem={(item) => (
              <List.Item actions={[<Button type="link" key="download">下载</Button>]}>
                <List.Item.Meta title={item.name} description={item.desc} />
              </List.Item>
            )}
          />
        </Card>
      )}
    </PageContainer>
  );
};

export default TaskDetail;
