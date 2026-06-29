import { DownloadOutlined } from '@ant-design/icons';
import { Button, Table, Typography } from 'antd';
import React from 'react';

const { Text } = Typography;

type Props = { result?: API.InferenceTaskResult };

const BatchResultPreview: React.FC<Props> = ({ result }) => {
  if (!result) return <Text type="secondary">暂无结果</Text>;
  return (
    <div>
      {result.summary && (
        <div style={{ marginBottom: 16 }}>
          <Text>
            总计 {result.summary.total} · 成功 {result.summary.success} · 失败{' '}
            {result.summary.failed}
          </Text>
        </div>
      )}
      {result.previewItems && result.previewItems.length > 0 && (
        <Table
          size="small"
          pagination={false}
          rowKey="index"
          dataSource={result.previewItems}
          columns={[
            { title: '#', dataIndex: 'index', width: 60 },
            {
              title: '文件名',
              dataIndex: 'inputName',
              width: 160,
              ellipsis: true,
            },
            {
              title: '文本预览',
              dataIndex: 'inputPreview',
              ellipsis: true,
              render: (text?: string) =>
                text ? (
                  <Text
                    style={{ whiteSpace: 'pre-wrap' }}
                    ellipsis={{ tooltip: text }}
                  >
                    {text}
                  </Text>
                ) : (
                  <Text type="secondary">-</Text>
                ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 72,
              render: (s: string) => (s === 'success' ? '成功' : '失败'),
            },
            { title: '摘要', dataIndex: 'summary', ellipsis: true },
          ]}
        />
      )}
      {result.outputDownloadUrl && (
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          href={result.outputDownloadUrl}
          style={{ marginTop: 16 }}
        >
          下载完整结果
        </Button>
      )}
    </div>
  );
};

export default BatchResultPreview;
