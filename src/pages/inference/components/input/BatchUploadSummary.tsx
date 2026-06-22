import type { UploadProps } from 'antd';
import React from 'react';
import InputFileActions from './InputFileActions';

type BatchUploadSummaryProps = {
  count: number;
  /** ZIP / 脚本等单文件场景可展示文件名 */
  primaryName?: string;
  onClear: () => void;
  clearLabel?: string;
  /** 单文件场景可提供，用于「重新选择」 */
  reselectUploadProps?: UploadProps;
};

const BatchUploadSummary: React.FC<BatchUploadSummaryProps> = ({
  count,
  primaryName,
  onClear,
  clearLabel,
  reselectUploadProps,
}) => {
  if (count <= 0) return null;

  const label =
    count === 1 && primaryName
      ? `已选择：${primaryName}`
      : `已选择 ${count} 个文件`;

  const showReselect = reselectUploadProps && (count === 1 || !!primaryName);

  return (
    <InputFileActions
      label={label}
      onRemove={onClear}
      removeLabel={clearLabel}
      reselectUploadProps={showReselect ? reselectUploadProps : undefined}
    />
  );
};

export default BatchUploadSummary;
