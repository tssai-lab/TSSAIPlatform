/**
 * 训练结果详情页（与 TSSAIPlatform-frontend-prototype 一致）
 * 任务信息、训练指标可视化（非实时说明）、结果文件列表
 */
import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Descriptions, List, Tag } from 'antd';
import React, { useEffect, useState } from 'react';
import { history, useParams } from '@umijs/max';
import { MOCK_TASK_DETAIL } from '@/constants/mockData';

const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [taskInfo, setTaskInfo] = useState<typeof MOCK_TASK_DETAIL | null>(null);

  useEffect(() => {
    setTaskInfo(MOCK_TASK_DETAIL);
  }, [id]);

  if (!taskInfo) return null;

  return (
    <PageContainer
      title="训练结果详情"
      subTitle="查看训练任务的详细信息和结果"
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
          <Descriptions.Item label="完成时间">{taskInfo.completeTime}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color="success">{taskInfo.status === 'success' ? '成功' : taskInfo.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="总耗时">{taskInfo.duration}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="训练指标可视化"
        extra={<span style={{ color: '#8c8c8c', fontSize: 12 }}>训练完成后生成，非实时显示</span>}
        style={{ marginBottom: 16 }}
      >
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
            <div style={{ fontSize: 24, marginBottom: 16 }}>图表区域</div>
            <div>训练指标图表（Mock 演示）</div>
            <div style={{ fontSize: 12, marginTop: 8, maxWidth: 500, margin: '12px auto' }}>
              说明：训练完成后，系统会在本地缓存训练指标数据，然后生成可视化图表。
              支持分布式硬件架构，图表数据存储在云端，确保稳定性和可扩展性。
            </div>
          </div>
        </div>
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
            <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>最终准确率</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{taskInfo.metrics.accuracy}</div>
          </div>
          <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
            <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>最终损失值</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{taskInfo.metrics.loss}</div>
          </div>
          <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
            <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>训练轮数</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{taskInfo.metrics.epochs}</div>
          </div>
          <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
            <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 8 }}>批次大小</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{taskInfo.metrics.batchSize}</div>
          </div>
        </div>
      </Card>

      <Card title="结果文件">
        <List
          dataSource={taskInfo.files}
          renderItem={(item) => (
            <List.Item
              actions={[<Button type="link" key="download">下载</Button>]}
            >
              <List.Item.Meta
                title={item.name}
                description={item.desc}
              />
            </List.Item>
          )}
        />
      </Card>
    </PageContainer>
  );
};

export default TaskDetail;
