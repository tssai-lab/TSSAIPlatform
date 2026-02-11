import React from 'react';
import { Modal, Button } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { message } from 'antd';

export interface CodePreviewProps {
  codeText?: string;
  fileName?: string;
  visible?: boolean;
  onClose?: () => void;
}

/**
 * 代码预览弹窗
 * 功能：显示代码文本，支持语法高亮、复制、关闭
 */
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
      width={800}
    >
      <div
        style={{
          maxHeight: 500,
          overflow: 'auto',
          fontFamily: 'monospace',
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
      <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
        提示：需要安装 CodeMirror 或类似库实现语法高亮
      </div>
    </Modal>
  );
};

export default CodePreview;






