import { PageContainer } from '@ant-design/pro-components';
import { useSearchParams } from '@umijs/max';
import React from 'react';
import InferenceWorkbench from '../components/InferenceWorkbench';

/**
 * 在线推理页 - Page 层
 * 选择模型 = 选择一次训练成功的实验版本（experimentId + versionNo）
 * 推荐从训练任务详情「在线推理」进入，自动锁定该次训练产出
 */
const InferencePlayground: React.FC = () => {
  const [searchParams] = useSearchParams();
  const experimentId = searchParams.get('experimentId');
  const versionNoRaw = searchParams.get('versionNo');
  const parsed = versionNoRaw ? Number(versionNoRaw) : NaN;
  const versionNo =
    Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;

  return (
    <PageContainer
      header={{
        title: '在线推理',
        subTitle: '对训练成功的实验版本进行在线验证，非上传的预训练权重',
      }}
    >
      <InferenceWorkbench experimentId={experimentId} versionNo={versionNo} />
    </PageContainer>
  );
};

export default InferencePlayground;
