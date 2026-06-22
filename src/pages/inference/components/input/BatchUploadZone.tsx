import { InboxOutlined, PlusOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Button, Upload } from 'antd';
import React from 'react';

type BatchUploadZoneProps = {
  hasFiles: boolean;
  uploadProps: UploadProps;
  emptyTitle: string;
  emptyHint?: string;
  addLabel?: string;
};

const BatchUploadZone: React.FC<BatchUploadZoneProps> = ({
  hasFiles,
  uploadProps,
  emptyTitle,
  emptyHint,
  addLabel = '继续添加文件',
}) => {
  if (hasFiles) {
    return (
      <Upload {...uploadProps} showUploadList={false}>
        <Button
          type="dashed"
          block
          icon={<PlusOutlined />}
          style={{ marginBottom: 0 }}
        >
          {addLabel}
        </Button>
      </Upload>
    );
  }

  return (
    <Upload.Dragger {...uploadProps} style={{ marginBottom: 0 }}>
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">{emptyTitle}</p>
      {emptyHint ? <p className="ant-upload-hint">{emptyHint}</p> : null}
    </Upload.Dragger>
  );
};

export default BatchUploadZone;
