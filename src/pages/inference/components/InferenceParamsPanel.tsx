import { Col, Collapse, Form, InputNumber, Row, Slider } from 'antd';
import React from 'react';

type InferenceParamsPanelProps = {
  modality: API.InferenceModality;
  params: API.InferenceParams;
  onChange: (params: API.InferenceParams) => void;
};

const InferenceParamsPanel: React.FC<InferenceParamsPanelProps> = ({
  modality,
  params,
  onChange,
}) => {
  const patch = (partial: API.InferenceParams) =>
    onChange({ ...params, ...partial });

  return (
    <Collapse
      ghost
      items={[
        {
          key: 'params',
          label: '推理参数',
          children: (
            <Form layout="vertical" size="small">
              {modality === 'CV' ? (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label={`置信度阈值 ${params.confidence ?? 0.5}`}>
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={params.confidence ?? 0.5}
                        onChange={(v) => patch({ confidence: v })}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Top-K">
                      <InputNumber
                        min={1}
                        max={20}
                        style={{ width: '100%' }}
                        value={params.topK ?? 5}
                        onChange={(v) => patch({ topK: v ?? 5 })}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              ) : (
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="Temperature">
                      <InputNumber
                        min={0}
                        max={2}
                        step={0.1}
                        style={{ width: '100%' }}
                        value={params.temperature ?? 0.7}
                        onChange={(v) => patch({ temperature: v ?? 0.7 })}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Max Tokens">
                      <InputNumber
                        min={16}
                        max={4096}
                        style={{ width: '100%' }}
                        value={params.maxTokens ?? 512}
                        onChange={(v) => patch({ maxTokens: v ?? 512 })}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Top-P">
                      <InputNumber
                        min={0}
                        max={1}
                        step={0.05}
                        style={{ width: '100%' }}
                        value={params.topP ?? 0.9}
                        onChange={(v) => patch({ topP: v ?? 0.9 })}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </Form>
          ),
        },
      ]}
    />
  );
};

export default InferenceParamsPanel;
