import React from 'react';

type Props = { id: string; copyable?: boolean };

const inlineButtonStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: 0,
  border: 'none',
  background: 'none',
  font: 'inherit',
  color: 'inherit',
};

const InferenceTaskId: React.FC<Props> = ({ id, copyable }) => {
  if (copyable) {
    return (
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(id)}
        style={inlineButtonStyle}
        title="点击复制"
      >
        {id}
      </button>
    );
  }
  return <span>{id}</span>;
};

export default InferenceTaskId;
