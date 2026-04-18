import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Tabs } from 'antd';
import React, { useEffect, useState } from 'react';
import { history, useParams } from '@umijs/max';
import { getDownloadUrl } from '@/services/ant-design-pro/files';
import { getModelDetail } from '@/services/ant-design-pro/model';

/**
 * 模型详情页
 */
const ModelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [modelInfo, setModelInfo] = useState<API.ModelDetail | null>(null);

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '-';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[idx]}`;
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      const res = await getModelDetail(id);
      setModelInfo(res?.data ?? null);
    })();
  }, [id]);

  return (
    <PageContainer
      title="模型详情"
      onBack={() => history.push('/model/list')}
      extra={[
        modelInfo?.storagePath ? (
          <Button key="download" type="primary">
            <a href={getDownloadUrl(modelInfo.storagePath)} style={{ color: 'inherit' }}>
              下载模型
            </a>
          </Button>
        ) : (
          <Button key="download" type="primary" disabled>
            下载模型
          </Button>
        ),
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
            {modelInfo?.uploadTime || modelInfo?.createdAt || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="大小">
            {modelInfo?.size || formatBytes(modelInfo?.sizeBytes)}
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






