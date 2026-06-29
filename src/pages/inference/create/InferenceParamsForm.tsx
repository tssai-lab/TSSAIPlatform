import { Card, Col, Form, InputNumber, Row, Select, Typography } from 'antd';
import React from 'react';
import { getInferenceParamFields } from '@/constants/inference/inferenceParamSchema';

type Props = {
  taskType: API.InferenceTaskType;
};

const InferenceParamsForm: React.FC<Props> = ({ taskType }) => {
  const fields = getInferenceParamFields(taskType);

  return (
    <Card title="推理参数" size="small" style={{ marginBottom: 16 }}>
      <Typography.Paragraph
        type="secondary"
        style={{ marginBottom: 16, fontSize: 13 }}
      >
        任务级推理配置，创建后不可修改；默认值来自平台与所选模型。
      </Typography.Paragraph>
      <Row gutter={16}>
        {fields.map((field) => (
          <Col xs={24} sm={12} key={field.key}>
            <Form.Item
              name={['inferenceParams', field.key]}
              label={field.label}
              tooltip={field.tooltip}
              rules={[{ required: true, message: `请填写${field.label}` }]}
            >
              {field.type === 'select' ? (
                <Select
                  options={field.options?.map((o) => ({
                    label: o.label,
                    value: o.value,
                  }))}
                />
              ) : (
                <InputNumber
                  style={{ width: '100%' }}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                />
              )}
            </Form.Item>
          </Col>
        ))}
      </Row>
    </Card>
  );
};

export default InferenceParamsForm;
