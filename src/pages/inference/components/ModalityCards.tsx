import {
  ApiOutlined,
  CameraOutlined,
  CommentOutlined,
} from '@ant-design/icons';
import { Badge, Card, Col, Row, Typography } from 'antd';
import React from 'react';
import { INFERENCE_MODALITIES } from '@/constants/platform';

type ModalityCardsProps = {
  activeModality: API.InferenceModality;
  counts: Record<API.InferenceModality, number>;
  onChange: (modality: API.InferenceModality) => void;
  countLabel?: string;
};

const ICONS: Record<API.InferenceModality, React.ReactNode> = {
  CV: <CameraOutlined style={{ fontSize: 22, color: '#1890ff' }} />,
  NLP: <CommentOutlined style={{ fontSize: 22, color: '#52c41a' }} />,
  MULTIMODAL: <ApiOutlined style={{ fontSize: 22, color: '#722ed1' }} />,
};

const ModalityCards: React.FC<ModalityCardsProps> = ({
  activeModality,
  counts,
  onChange,
  countLabel = '个模型',
}) => {
  const modalities = Object.keys(
    INFERENCE_MODALITIES,
  ) as API.InferenceModality[];

  return (
    <Row gutter={12}>
      {modalities.map((key) => {
        const meta = INFERENCE_MODALITIES[key];
        const selected = key === activeModality;
        return (
          <Col xs={24} sm={8} key={key}>
            <Card
              size="small"
              hoverable
              onClick={() => onChange(key)}
              style={{
                cursor: 'pointer',
                borderColor: selected ? '#1890ff' : undefined,
                background: selected ? 'rgba(24, 144, 255, 0.04)' : undefined,
                boxShadow: selected
                  ? '0 0 0 2px rgba(24, 144, 255, 0.12)'
                  : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {ICONS[key]}
                <div>
                  <Typography.Text strong>{meta.label}</Typography.Text>
                  <div>
                    <Badge
                      count={counts[key]}
                      showZero
                      overflowCount={999}
                      style={{
                        backgroundColor: selected ? '#1890ff' : '#d9d9d9',
                      }}
                    />
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 12, marginLeft: 8 }}
                    >
                      {countLabel}
                    </Typography.Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};

export default ModalityCards;
