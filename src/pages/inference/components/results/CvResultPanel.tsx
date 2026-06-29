import { Image, Table, Typography } from 'antd';
import React from 'react';
import BatchResultPreview from './BatchResultPreview';

const { Title, Text } = Typography;

type Props = {
  inputPreviewUrl?: string;
  result?: API.InferenceTaskResult;
  inputMode: API.InferenceInputMode;
};

const CvResultPanel: React.FC<Props> = ({
  inputPreviewUrl,
  result,
  inputMode,
}) => {
  if (inputMode === 'batch') {
    return <BatchResultPreview result={result} />;
  }
  return (
    <div>
      {inputPreviewUrl && (
        <div style={{ marginBottom: 16 }}>
          <Title level={5}>输入图像</Title>
          <Image
            src={inputPreviewUrl}
            alt="input"
            style={{ maxWidth: 480, borderRadius: 8 }}
          />
        </div>
      )}
      {result?.annotatedImageUrl && (
        <div style={{ marginBottom: 16 }}>
          <Title level={5}>检测结果（框图）</Title>
          <Image
            src={result.annotatedImageUrl}
            alt="annotated"
            style={{ maxWidth: 480, borderRadius: 8 }}
          />
        </div>
      )}
      {result?.predictions && result.predictions.length > 0 && (
        <>
          <Title level={5}>检测列表</Title>
          <Table
            size="small"
            pagination={false}
            rowKey={(_, i) => String(i)}
            dataSource={result.predictions}
            columns={[
              { title: '标签', dataIndex: 'label' },
              {
                title: '置信度',
                dataIndex: 'score',
                render: (v: number) => `${(v * 100).toFixed(1)}%`,
              },
              {
                title: '边界框',
                dataIndex: 'bbox',
                render: (bbox?: number[]) => (bbox ? bbox.join(', ') : '-'),
              },
            ]}
          />
        </>
      )}
      {result?.latencyMs != null && (
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          耗时 {result.latencyMs} ms
        </Text>
      )}
    </div>
  );
};

export default CvResultPanel;
