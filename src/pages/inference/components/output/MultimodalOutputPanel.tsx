import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Empty, Space } from 'antd';
import React from 'react';
import { INFERENCE_OUTPUT_CONTENT_STYLE } from '@/constants/inference';

type MultimodalOutputPanelProps = {
  result: API.InferencePredictResult | null;
  running: boolean;
};

const MultimodalOutputPanel: React.FC<MultimodalOutputPanelProps> = ({
  result,
  running,
}) => {
  if (running) {
    return <Empty description="推理中..." />;
  }
  if (!result) {
    return <Empty description="运行推理后在此查看回答" />;
  }

  const text = result.answer || result.generatedText || '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inference-mm-${result.recordId || 'result'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Space style={{ marginBottom: 8, float: 'right' }}>
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          onClick={handleCopy}
        >
          复制
        </Button>
        <Button
          type="text"
          size="small"
          icon={<DownloadOutlined />}
          onClick={handleDownload}
        >
          下载
        </Button>
      </Space>
      <div style={{ ...INFERENCE_OUTPUT_CONTENT_STYLE, clear: 'both' }}>
        {text}
      </div>
    </div>
  );
};

export default MultimodalOutputPanel;
