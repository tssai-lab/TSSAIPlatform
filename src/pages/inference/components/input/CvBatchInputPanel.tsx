import type { UploadFile, UploadProps } from 'antd';
import { message, Tabs } from 'antd';
import React, { useEffect, useRef } from 'react';
import {
  CV_BATCH_IMAGE_ACCEPT,
  CV_BATCH_SUB_TABS,
  type CvBatchSubMode,
} from '@/constants/inference';
import { INFERENCE_CONFIG } from '@/constants/platform';
import type { CvBatchInputState } from '@/services/platform';
import InferenceParamsPanel from '../InferenceParamsPanel';
import BatchFileList from './BatchFileList';
import BatchUploadZone from './BatchUploadZone';
import { collectUploadFiles, mergeUploadedFiles } from './batchUploadUtils';

const EMPTY_FILE_LIST: UploadFile[] = [];

type CvBatchInputPanelProps = {
  input: CvBatchInputState;
  params: API.InferenceParams;
  onInputChange: (input: CvBatchInputState) => void;
  onParamsChange: (params: API.InferenceParams) => void;
};

const TAB_BODY_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 380,
};

const CvBatchInputPanel: React.FC<CvBatchInputPanelProps> = ({
  input,
  params,
  onInputChange,
  onParamsChange,
}) => {
  const maxBytes = INFERENCE_CONFIG.CV_IMAGE_MAX_MB * 1024 * 1024;
  const filesRef = useRef(input.files);

  useEffect(() => {
    filesRef.current = input.files;
  }, [input.files]);

  const patch = (partial: Partial<CvBatchInputState>) =>
    onInputChange({ ...input, ...partial });

  const handleFilesChange = (files: File[], subMode: CvBatchSubMode) => {
    filesRef.current = files;
    patch({ subMode, files });
  };

  const makePickHandler =
    (subMode: CvBatchSubMode): UploadProps['onChange'] =>
    ({ fileList }) => {
      const incoming = collectUploadFiles(fileList);
      if (!incoming.length) return;
      const oversized = incoming.filter((file) => file.size > maxBytes);
      const accepted = incoming.filter((file) => file.size <= maxBytes);
      if (oversized.length) {
        message.warning(
          `${oversized.length} 个文件超过 ${INFERENCE_CONFIG.CV_IMAGE_MAX_MB}MB，已跳过`,
        );
      }
      if (!accepted.length) return;
      handleFilesChange(
        mergeUploadedFiles(filesRef.current, accepted),
        subMode,
      );
    };

  const makeUploadProps = (
    subMode: CvBatchSubMode,
    options?: {
      multiple?: boolean;
      directory?: boolean;
      accept?: string;
      maxCount?: number;
    },
  ): UploadProps => ({
    multiple: options?.multiple,
    directory: options?.directory,
    accept: options?.accept,
    maxCount: options?.maxCount,
    fileList: EMPTY_FILE_LIST,
    showUploadList: false,
    beforeUpload: () => false,
    onChange: makePickHandler(subMode),
  });

  const renderTabBody = (
    subMode: CvBatchSubMode,
    uploadProps: UploadProps,
    emptyTitle: string,
    emptyHint: string,
    addLabel?: string,
    reselectUploadProps?: UploadProps,
  ) => {
    const active = input.subMode === subMode;
    const files = active ? input.files : [];

    return (
      <div style={TAB_BODY_STYLE}>
        <BatchUploadZone
          hasFiles={files.length > 0}
          uploadProps={uploadProps}
          emptyTitle={emptyTitle}
          emptyHint={emptyHint}
          addLabel={addLabel}
        />
        {active && files.length > 0 ? (
          <BatchFileList
            files={files}
            onChange={(next) => handleFilesChange(next, subMode)}
            showImagePreview={subMode !== 'zip'}
            reselectUploadProps={reselectUploadProps}
          />
        ) : null}
      </div>
    );
  };

  const filesUploadProps = makeUploadProps('files', {
    multiple: true,
    accept: CV_BATCH_IMAGE_ACCEPT,
  });
  const folderUploadProps = makeUploadProps('folder', {
    directory: true,
    multiple: true,
    accept: CV_BATCH_IMAGE_ACCEPT,
  });
  const zipUploadProps = makeUploadProps('zip', {
    multiple: false,
    accept: '.zip',
    maxCount: 1,
  });

  const tabs = CV_BATCH_SUB_TABS.map(({ key, label }) => {
    if (key === 'files') {
      return {
        key,
        label,
        children: renderTabBody(
          'files',
          filesUploadProps,
          '点击或拖拽多个图片到此处',
          `支持 JPG/PNG/WebP，单张最大 ${INFERENCE_CONFIG.CV_IMAGE_MAX_MB}MB`,
          '继续添加图片',
        ),
      };
    }
    if (key === 'folder') {
      return {
        key,
        label,
        children: renderTabBody(
          'folder',
          folderUploadProps,
          '选择本地图片文件夹',
          '将读取文件夹内的全部图片',
          '继续添加文件夹',
        ),
      };
    }
    return {
      key,
      label,
      children: renderTabBody(
        'zip',
        zipUploadProps,
        '上传 ZIP 压缩包',
        '打包后的图片数据集，仅支持 .zip',
        '重新选择 ZIP',
        zipUploadProps,
      ),
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs
        size="small"
        activeKey={input.subMode}
        onChange={(key) => patch({ subMode: key as CvBatchSubMode, files: [] })}
        items={tabs}
      />
      <InferenceParamsPanel
        modality="CV"
        params={params}
        onChange={onParamsChange}
      />
    </div>
  );
};

export default CvBatchInputPanel;
