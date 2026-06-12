import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { Button, Empty, Space, Tag, Typography } from 'antd';
import React from 'react';
import { INFERENCE_OUTPUT_CONTENT_STYLE } from '@/constants/inference';

type CvOutputPanelProps = {
  result: API.InferencePredictResult | null;
  running: boolean;
};

const CvOutputPanel: React.FC<CvOutputPanelProps> = ({ result, running }) => {
  if (running) {
    return <Empty description="推理中..." />;
  }
  if (!result) {
    return <Empty description="运行推理后在此查看检测结果" />;
  }

  const text = formatCvOutput(result);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inference-cv-${result.recordId || 'result'}.json`;
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
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Detection Results
        </Typography.Title>
        {(result.predictions ?? []).map((p, i) => (
          <div key={predictionItemKey(p)}>
            {i + 1}. {p.label} ({(p.score * 100).toFixed(1)}%)
            {p.bbox ? ` — bbox: [${p.bbox.join(', ')}]` : ''}
          </div>
        ))}
        {result.scene ? (
          <>
            <Typography.Title level={5}>Scene</Typography.Title>
            <div>{result.scene}</div>
          </>
        ) : null}
        {result.semanticLabels?.length ? (
          <>
            <Typography.Title level={5}>Semantic Labels</Typography.Title>
            <Space wrap>
              {result.semanticLabels.map((l) => (
                <Tag key={l}>{l}</Tag>
              ))}
            </Space>
          </>
        ) : null}
      </div>
    </div>
  );
};

function predictionItemKey(p: API.InferenceCvPrediction) {
  const bbox = p.bbox?.join(',') ?? 'none';
  return `${p.label}:${p.score}:${bbox}`;
}

function formatCvOutput(result: API.InferencePredictResult) {
  return JSON.stringify(result, null, 2);
}

export default CvOutputPanel;
