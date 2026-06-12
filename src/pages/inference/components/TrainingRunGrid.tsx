import { Col, Empty, Input, Pagination, Row, Spin, Typography } from 'antd';
import React from 'react';
import { INFERENCE_MODALITIES } from '@/constants/platform';
import TrainingRunCard from './TrainingRunCard';

type TrainingRunGridProps = {
  modality: API.InferenceModality;
  items: API.InferenceTrainingCandidate[];
  total: number;
  page: number;
  pageSize: number;
  keyword: string;
  loading: boolean;
  onKeywordChange: (keyword: string) => void;
  onPageChange: (page: number) => void;
  onSelect: (candidate: API.InferenceTrainingCandidate) => void;
};

const TrainingRunGrid: React.FC<TrainingRunGridProps> = ({
  modality,
  items,
  total,
  page,
  pageSize,
  keyword,
  loading,
  onKeywordChange,
  onPageChange,
  onSelect,
}) => (
  <div>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
      }}
    >
      <div>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
          选择训练产出
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          点击卡片进入推理。也可从训练任务详情 → 版本历史 →
          在线推理，直接锁定该版本。
        </Typography.Text>
      </div>
      <Input.Search
        placeholder="搜索任务名、实验 ID..."
        allowClear
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
        style={{ width: 280 }}
      />
    </div>

    <Spin spinning={loading}>
      {total === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <>
              暂无{INFERENCE_MODALITIES[modality].label}训练产出。
              <br />
              请先在训练任务中完成训练，再从任务详情版本历史进入在线推理。
            </>
          }
        />
      ) : (
        <>
          <Row gutter={[12, 12]}>
            {items.map((item) => (
              <Col
                xs={24}
                sm={12}
                md={8}
                xl={6}
                key={`${item.experimentId}:${item.versionNo}`}
              >
                <TrainingRunCard candidate={item} onSelect={onSelect} />
              </Col>
            ))}
          </Row>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 16,
            }}
          >
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger={false}
              showTotal={(count) => `共 ${count} 条`}
              onChange={onPageChange}
            />
          </div>
        </>
      )}
    </Spin>
  </div>
);

export default TrainingRunGrid;
