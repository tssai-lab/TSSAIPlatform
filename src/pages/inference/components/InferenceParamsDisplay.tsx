import { Card, Descriptions, Typography } from 'antd';
import React from 'react';
import { formatInferenceParamsForDisplay } from '@/constants/inference/inferenceParamSchema';

type Props = {
  taskType: API.InferenceTaskType;
  inferenceParams?: Record<string, string | number>;
  useCustomScript?: boolean;
  scriptFileName?: string;
  scriptEntryPoint?: string;
};

const InferenceParamsDisplay: React.FC<Props> = ({
  taskType,
  inferenceParams,
  useCustomScript,
  scriptFileName,
  scriptEntryPoint,
}) => {
  const rows = formatInferenceParamsForDisplay(inferenceParams, taskType);

  return (
    <Card title="推理配置" size="small" style={{ marginBottom: 16 }}>
      <Descriptions column={{ xs: 1, sm: 2 }} size="small">
        <Descriptions.Item label="推理方式">
          {useCustomScript ? '自定义脚本' : '平台默认 handler'}
        </Descriptions.Item>
        {useCustomScript && (
          <>
            <Descriptions.Item label="脚本文件">
              {scriptFileName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="入口函数">
              {scriptEntryPoint || 'inference_handler'}
            </Descriptions.Item>
          </>
        )}
      </Descriptions>
      {rows.length > 0 ? (
        <Descriptions
          column={{ xs: 1, sm: 2, md: 3 }}
          size="small"
          bordered
          style={{ marginTop: 12 }}
        >
          {rows.map((row) => (
            <Descriptions.Item label={row.label} key={row.key}>
              {row.value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      ) : (
        <Typography.Text
          type="secondary"
          style={{ display: 'block', marginTop: 8 }}
        >
          未记录推理参数
        </Typography.Text>
      )}
    </Card>
  );
};

export default InferenceParamsDisplay;
