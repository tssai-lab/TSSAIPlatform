import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Button, Space, Typography, Upload } from 'antd';
import React from 'react';

const BAR_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 8,
  padding: '6px 10px',
  background: '#fafafa',
  borderRadius: 6,
  border: '1px solid #f0f0f0',
};

type InputFileActionsProps = {
  label: string;
  onRemove: () => void;
  removeLabel?: string;
  /** 传入时在「删除」旁展示「重新选择」 */
  reselectUploadProps?: UploadProps;
};

const InputFileActions: React.FC<InputFileActionsProps> = ({
  label,
  onRemove,
  removeLabel = '删除',
  reselectUploadProps,
}) => (
  <div style={BAR_STYLE}>
    <Typography.Text
      type="secondary"
      style={{ fontSize: 13, flex: 1, minWidth: 0, marginRight: 8 }}
      ellipsis
    >
      {label}
    </Typography.Text>
    <Space size={4} style={{ flexShrink: 0 }}>
      {reselectUploadProps ? (
        <Upload {...reselectUploadProps} showUploadList={false}>
          <Button
            type="link"
            size="small"
            icon={<ReloadOutlined />}
            style={{ padding: 0, height: 'auto' }}
          >
            重新选择
          </Button>
        </Upload>
      ) : null}
      <Button
        type="link"
        size="small"
        danger
        icon={<DeleteOutlined />}
        onClick={onRemove}
        style={{ padding: 0, height: 'auto' }}
      >
        {removeLabel}
      </Button>
    </Space>
  </div>
);

export default InputFileActions;
