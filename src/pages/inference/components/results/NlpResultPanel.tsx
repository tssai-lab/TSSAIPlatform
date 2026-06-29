import { Table, Typography } from 'antd';
import React from 'react';
import BatchResultPreview from './BatchResultPreview';

const { Title, Paragraph, Text } = Typography;

const inputBlockStyle = {
  background: 'rgba(255,255,255,0.04)',
  padding: 12,
  borderRadius: 8,
  marginBottom: 0,
  whiteSpace: 'pre-wrap' as const,
};

type Props = {
  result?: API.InferenceTaskResult;
  inputMode: API.InferenceInputMode;
  inputText?: string;
};

const NlpResultPanel: React.FC<Props> = ({ result, inputMode, inputText }) => {
  if (inputMode === 'batch') {
    return <BatchResultPreview result={result} />;
  }
  if (!result && !inputText) {
    return <Text type="secondary">暂无结果</Text>;
  }
  return (
    <div>
      {inputText && (
        <div style={{ marginBottom: 16 }}>
          <Title level={5}>输入文本</Title>
          <Paragraph style={inputBlockStyle}>{inputText}</Paragraph>
        </div>
      )}
      {result?.label != null && (
        <div style={{ marginBottom: 12 }}>
          <Title level={5}>分类结果</Title>
          <Text>{result.label}</Text>
          {result.score != null && (
            <Text style={{ marginLeft: 8 }}>
              {(result.score * 100).toFixed(1)}%
            </Text>
          )}
        </div>
      )}
      {result?.generatedText && (
        <div style={{ marginBottom: 12 }}>
          <Title level={5}>推理输出</Title>
          <Paragraph style={inputBlockStyle}>{result.generatedText}</Paragraph>
        </div>
      )}
      {result?.entities && result.entities.length > 0 && (
        <>
          <Title level={5}>实体</Title>
          <Table
            size="small"
            pagination={false}
            rowKey={(_, i) => String(i)}
            dataSource={result.entities}
            columns={[
              { title: '文本', dataIndex: 'text' },
              { title: '类型', dataIndex: 'label' },
              { title: '起', dataIndex: 'start', width: 60 },
              { title: '止', dataIndex: 'end', width: 60 },
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

export default NlpResultPanel;
