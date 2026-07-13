import { CopyOutlined, UndoOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, message, Space } from 'antd';
import React, { useEffect, useState } from 'react';
import CodeEditor from '@/components/CodeEditor';

export interface CodePreviewProps {
  codeText?: string;
  /** 服务端原始内容，用于「恢复原始」 */
  originalCodeText?: string;
  fileName?: string;
  visible?: boolean;
  onClose?: () => void;
  /** 关闭弹窗时回传编辑后的内容（供详情页同步） */
  onContentChange?: (value: string) => void;
  editable?: boolean;
}

/**
 * 代码预览弹窗：语法高亮 + 可编辑（本地编辑，不回写后端）
 */
const CodePreview: React.FC<CodePreviewProps> = ({
  codeText = '',
  originalCodeText,
  fileName = '',
  visible = false,
  onClose,
  onContentChange,
  editable = true,
}) => {
  const [draft, setDraft] = useState(codeText);
  const baseline = originalCodeText ?? codeText;

  useEffect(() => {
    if (visible) {
      setDraft(codeText);
    }
  }, [visible, codeText]);

  const handleCopy = () => {
    navigator.clipboard.writeText(draft).then(() => {
      message.success('代码已复制到剪贴板');
    });
  };

  const handleReset = () => {
    setDraft(baseline);
    message.info('已恢复为服务端原始内容');
  };

  const handleClose = () => {
    if (draft !== codeText) {
      onContentChange?.(draft);
    }
    onClose?.();
  };

  return (
    <Modal
      title={`代码预览 - ${fileName}`}
      open={visible}
      onCancel={handleClose}
      footer={
        <Space wrap>
          {editable && draft !== baseline && (
            <Button icon={<UndoOutlined />} onClick={handleReset}>
              恢复原始
            </Button>
          )}
          <Button icon={<CopyOutlined />} onClick={handleCopy}>
            复制
          </Button>
          <Button type="primary" onClick={handleClose}>
            关闭
          </Button>
        </Space>
      }
      width={900}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        message="编辑仅保存在当前页面，不会回写训练代码包；关闭弹窗后同步到详情页预览区。"
        style={{ marginBottom: 12 }}
      />
      <CodeEditor
        value={draft}
        fileName={fileName}
        onChange={editable ? setDraft : undefined}
        readOnly={!editable}
        minHeight="400px"
        maxHeight="560px"
      />
    </Modal>
  );
};

export default CodePreview;
