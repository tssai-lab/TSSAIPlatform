import React from 'react';

type Props = { name: string; taskType?: API.InferenceTaskType };

/** 模型列 — 普通文本展示 */
const InferenceModelTag: React.FC<Props> = ({ name }) => (
  <span
    style={{
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      display: 'inline-block',
      maxWidth: '100%',
    }}
    title={name}
  >
    {name}
  </span>
);

export default InferenceModelTag;
