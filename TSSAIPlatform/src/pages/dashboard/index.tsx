import { PageContainer } from '@ant-design/pro-components';
import { Card, Row, Col, Statistic } from 'antd';
import React from 'react';

/**
 * 首页/仪表盘
 */
const Dashboard: React.FC = () => {
  return (
    <PageContainer title="首页">
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="模型总数" value={0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="数据集总数" value={0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="训练任务" value={0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="运行中任务" value={0} />
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default Dashboard;



