import { FolderOpenOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { Button, Upload } from 'antd';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  CV_BATCH_IMAGE_ACCEPT,
  NLP_BATCH_TEXT_FILE_ACCEPT,
} from '@/constants/inference';
import { INFERENCE_CONFIG } from '@/constants/platform';
import BatchFileList from './BatchFileList';
import BatchUploadZone from './BatchUploadZone';
import { collectUploadFiles, mergeUploadedFiles } from './batchUploadUtils';

type CustomScriptDataUploadProps = {
  modality: API.InferenceModality;
  files: File[];
  onFilesChange: (files: File[]) => void;
};

function acceptForModality(modality: API.InferenceModality) {
  if (modality === 'CV') return CV_BATCH_IMAGE_ACCEPT;
  if (modality === 'NLP') return NLP_BATCH_TEXT_FILE_ACCEPT;
  return undefined;
}

function acceptWithZip(accept?: string) {
  if (!accept) return '.zip';
  return accept.includes('.zip') ? accept : `${accept},.zip`;
}

const EMPTY_FILE_LIST: UploadFile[] = [];

const TAB_BODY_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 320,
};

const CustomScriptDataUpload: React.FC<CustomScriptDataUploadProps> = ({
  modality,
  files,
  onFilesChange,
}) => {
  const accept = acceptForModality(modality);
  const draggerAccept = useMemo(() => acceptWithZip(accept), [accept]);
  const maxBytes =
    modality === 'CV' || modality === 'MULTIMODAL'
      ? INFERENCE_CONFIG.CV_IMAGE_MAX_MB * 1024 * 1024
      : undefined;

  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const handleFilesChange = (next: File[]) => {
    filesRef.current = next;
    onFilesChange(next);
  };

  const handlePick: UploadProps['onChange'] = ({ fileList }) => {
    const incoming = collectUploadFiles(fileList);
    if (!incoming.length) return;
    handleFilesChange(mergeUploadedFiles(filesRef.current, incoming, maxBytes));
  };

  const pickProps: UploadProps = {
    fileList: EMPTY_FILE_LIST,
    showUploadList: false,
    beforeUpload: () => false,
    onChange: handlePick,
  };

  const zipOnly =
    files.length === 1 && files[0].name.toLowerCase().endsWith('.zip');
  const showImagePreview = modality === 'CV' || modality === 'MULTIMODAL';

  return (
    <div style={TAB_BODY_STYLE}>
      <BatchUploadZone
        hasFiles={files.length > 0}
        uploadProps={{ ...pickProps, multiple: true, accept: draggerAccept }}
        emptyTitle="上传推理所需数据文件"
        emptyHint="可多选，脚本运行时将读取这些输入；支持多次添加、文件夹与 .zip"
        addLabel="继续添加数据文件"
      />
      <div style={{ textAlign: 'center' }}>
        <Upload directory multiple accept={accept} {...pickProps}>
          <Button
            type="link"
            icon={<FolderOpenOutlined />}
            style={{ padding: 0, height: 'auto' }}
          >
            选择文件夹
          </Button>
        </Upload>
      </div>
      <BatchFileList
        files={files}
        onChange={handleFilesChange}
        showImagePreview={showImagePreview && !zipOnly}
      />
    </div>
  );
};

export default CustomScriptDataUpload;
