import type { UploadFile, UploadProps } from 'antd';
import { Input, Tabs, Typography } from 'antd';
import React, { useEffect, useRef } from 'react';
import {
  NLP_BATCH_SUB_TABS,
  NLP_BATCH_TEXT_FILE_ACCEPT,
  type NlpBatchSubMode,
} from '@/constants/inference';
import { INFERENCE_CONFIG } from '@/constants/platform';
import type { NlpBatchInputState } from '@/services/platform';
import InferenceParamsPanel from '../InferenceParamsPanel';
import BatchFileList from './BatchFileList';
import BatchUploadZone from './BatchUploadZone';
import { collectUploadFiles, mergeUploadedFiles } from './batchUploadUtils';

const { TextArea } = Input;

const EMPTY_FILE_LIST: UploadFile[] = [];

type NlpBatchInputPanelProps = {
  input: NlpBatchInputState;
  params: API.InferenceParams;
  onInputChange: (input: NlpBatchInputState) => void;
  onParamsChange: (params: API.InferenceParams) => void;
};

const TAB_BODY_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 380,
};

const NlpBatchInputPanel: React.FC<NlpBatchInputPanelProps> = ({
  input,
  params,
  onInputChange,
  onParamsChange,
}) => {
  const filesRef = useRef(input.files);

  useEffect(() => {
    filesRef.current = input.files;
  }, [input.files]);

  const patch = (partial: Partial<NlpBatchInputState>) =>
    onInputChange({ ...input, ...partial });

  const handleFilesChange = (files: File[], subMode: NlpBatchSubMode) => {
    filesRef.current = files;
    patch({ subMode, files });
  };

  const makePickHandler =
    (subMode: NlpBatchSubMode): UploadProps['onChange'] =>
    ({ fileList }) => {
      const incoming = collectUploadFiles(fileList);
      if (!incoming.length) return;
      handleFilesChange(
        mergeUploadedFiles(filesRef.current, incoming),
        subMode,
      );
    };

  const makeUploadProps = (
    subMode: NlpBatchSubMode,
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
    subMode: NlpBatchSubMode,
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
            reselectUploadProps={reselectUploadProps}
          />
        ) : null}
      </div>
    );
  };

  const filesUploadProps = makeUploadProps('files', {
    multiple: true,
    accept: NLP_BATCH_TEXT_FILE_ACCEPT,
  });
  const folderUploadProps = makeUploadProps('folder', {
    directory: true,
    multiple: true,
    accept: NLP_BATCH_TEXT_FILE_ACCEPT,
  });
  const zipUploadProps = makeUploadProps('zip', {
    multiple: false,
    accept: '.zip',
    maxCount: 1,
  });

  const pasteLineCount = input.pasteText
    .split('\n')
    .filter((line) => line.trim()).length;

  const tabs = NLP_BATCH_SUB_TABS.map(({ key, label }) => {
    if (key === 'paste') {
      return {
        key,
        label,
        children: (
          <>
            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginBottom: 8 }}
            >
              每行一条待推理文本，适合快速批量输入
            </Typography.Text>
            <TextArea
              placeholder={'示例：\n第一条待分析文本\n第二条待分析文本'}
              value={input.pasteText}
              onChange={(e) =>
                patch({ subMode: 'paste', pasteText: e.target.value })
              }
              maxLength={INFERENCE_CONFIG.NLP_TEXT_MAX_CHARS * 20}
              showCount
              autoSize={{ minRows: 12, maxRows: 20 }}
            />
            {pasteLineCount > 0 ? (
              <Typography.Text
                type="secondary"
                style={{ display: 'block', marginTop: 8, fontSize: 13 }}
              >
                共 {pasteLineCount} 条有效文本
              </Typography.Text>
            ) : null}
          </>
        ),
      };
    }
    if (key === 'files') {
      return {
        key,
        label,
        children: renderTabBody(
          'files',
          filesUploadProps,
          '上传多个文本文件',
          '支持 .txt / .csv / .jsonl',
          '继续添加文本文件',
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
          '选择本地文本文件夹',
          '将读取文件夹内的 .txt / .csv / .jsonl 文件',
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
        '打包后的文本数据集，仅支持 .zip',
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
        onChange={(key) =>
          patch({
            subMode: key as NlpBatchSubMode,
            files: [],
            pasteText: key === 'paste' ? input.pasteText : '',
          })
        }
        items={tabs}
      />
      <InferenceParamsPanel
        modality="NLP"
        params={params}
        onChange={onParamsChange}
      />
    </div>
  );
};

export default NlpBatchInputPanel;
