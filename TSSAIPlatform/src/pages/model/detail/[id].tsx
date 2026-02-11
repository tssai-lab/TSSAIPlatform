import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Tabs } from 'antd';
import React, { useEffect, useState } from 'react';
import { history, useParams } from '@umijs/max';

/**
 * 模型详情页
 */
const ModelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [modelInfo, setModelInfo] = useState<any>(null);

  useEffect(() => {
    // TODO: 调用接口 GET /api/model/detail
    console.log('查询模型详情:', id);
    // setModelInfo(data);
  }, [id]);

  return (
    <PageContainer
      title="模型详情"
      onBack={() => history.push('/model/list')}
      extra={[
        <Button key="download">下载模型</Button>,
        <Button key="back" onClick={() => history.push('/model/list')}>
          返回列表
        </Button>,
      ]}
    >
      <Card title="基础信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="模型名称">
            {modelInfo?.name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="版本号">
            {modelInfo?.version || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            {modelInfo?.type || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="上传时间">
            {modelInfo?.uploadTime || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="大小">
            {modelInfo?.size || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备注">
            {modelInfo?.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card>
        <Tabs
          items={[
            {
              key: 'code',
              label: '代码预览',
              children: (
                <div>
                  {/* TODO: 调用接口 GET /api/model/previewCode */}
                  {/* TODO: 使用代码预览组件显示代码 */}
                  <p>代码预览功能待实现</p>
                </div>
              ),
            },
            {
              key: 'dataset',
              label: '关联数据集',
              children: (
                <div>
                  {/* TODO: 显示关联的数据集列表 */}
                  <p>关联数据集功能待实现</p>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </PageContainer>
  );
};

export default ModelDetail;






