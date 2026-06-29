import { Image, Typography } from 'antd';
import React from 'react';
import BatchResultPreview from './BatchResultPreview';

const { Title, Paragraph, Text } = Typography;

const textBlockStyle = {
  background: 'rgba(255,255,255,0.04)',
  padding: 12,
  borderRadius: 8,
  whiteSpace: 'pre-wrap' as const,
  marginBottom: 0,
};

type Props = {
  inputPreviewUrl?: string;
  result?: API.InferenceTaskResult;
  inputMode: API.InferenceInputMode;
  prompt?: string;
  /** 推理未完成时为 true，展示占位提示 */
  pendingAnswer?: boolean;
};

const MultimodalResultPanel: React.FC<Props> = ({
  inputPreviewUrl,
  result,
  inputMode,
  prompt,
  pendingAnswer,
}) => {
  if (inputMode === 'batch') {
    return <BatchResultPreview result={result} />;
  }
  if (!result && !inputPreviewUrl && !prompt) {
    return <Text type="secondary">暂无结果</Text>;
  }

  const answer = result?.answer || result?.generatedText;

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
      {prompt && (
        <div style={{ marginBottom: 16 }}>
          <Title level={5}>问题</Title>
          <Paragraph style={textBlockStyle}>{prompt}</Paragraph>
        </div>
      )}
      {(answer || pendingAnswer || prompt) && (
        <div>
          <Title level={5}>回答</Title>
          {answer ? (
            <Paragraph style={textBlockStyle}>{answer}</Paragraph>
          ) : (
            <Text type="secondary">推理完成后展示回答</Text>
          )}
        </div>
      )}
      {result?.latencyMs != null && (
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          耗时 {result.latencyMs} ms
        </Text>
      )}
    </div>
  );
};

export default MultimodalResultPanel;
