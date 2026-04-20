import { CopyOutlined } from '@ant-design/icons';
import { Button, message, Modal } from 'antd';
import React from 'react';

export interface CodePreviewProps {
  codeText?: string;
  fileName?: string;
  visible?: boolean;
  onClose?: () => void;
}

const CodePreview: React.FC<CodePreviewProps> = ({
  codeText = '',
  fileName = '',
  visible = false,
  onClose,
}) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(codeText).then(() => {
      message.success('代码已复制到剪贴板');
    });
  };

  return (
    <Modal
      title={`代码预览 - ${fileName}`}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopy}>
          复制
        </Button>,
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
      width={900}
    >
      <div
        style={{
          maxHeight: 560,
          overflow: 'auto',
          fontFamily: 'Consolas, Menlo, Monaco, monospace',
          fontSize: 12,
          background: '#f5f5f5',
          padding: 16,
          borderRadius: 4,
        }}
      >
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {codeText || '暂无代码内容'}
        </pre>
      </div>
    </Modal>
  );
};

export default CodePreview;
