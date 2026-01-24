import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Descriptions } from 'antd';
import React, { useEffect, useState } from 'react';
import { history, useParams } from '@umijs/max';

/**
 * 训练结果详情页
 */
const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [taskInfo, setTaskInfo] = useState<any>(null);

  useEffect(() => {
    // TODO: 调用接口 GET /api/task/detail
    console.log('查询任务详情:', id);
    // setTaskInfo(data);
  }, [id]);

  return (
    <PageContainer
      title="训练结果详情"
      onBack={() => history.push('/task/list')}
    >
      <Card title="任务信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="任务名称">
            {taskInfo?.name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="模型">
            {taskInfo?.modelName || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="数据集">
            {taskInfo?.datasetName || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {taskInfo?.createTime || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {taskInfo?.status || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="总耗时">
            {taskInfo?.duration || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="训练指标" style={{ marginBottom: 16 }}>
        {/* TODO: 调用接口 GET /api/task/metrics */}
        {/* TODO: 使用 ChartPanel 组件渲染图表 */}
        <div style={{ height: 400 }}>
          <p>训练指标图表待实现</p>
        </div>
      </Card>

      <Card title="结果文件">
        {/* TODO: 显示结果文件列表，支持下载 */}
        {/* TODO: 调用接口 GET /api/task/file/download */}
        <p>结果文件列表待实现</p>
      </Card>
    </PageContainer>
  );
};

export default TaskDetail;






