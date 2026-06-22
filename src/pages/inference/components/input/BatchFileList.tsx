import {
  DeleteOutlined,
  FileOutlined,
  FileZipOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Button, Empty, Image, List, Space, Typography, Upload } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import {
  fileRelativePath,
  fileStableKey,
  formatFileSize,
  isImageFile,
  removeFileFromList,
  sumFileSizes,
} from './batchUploadUtils';

const LIST_MAX_HEIGHT = 360;
const GRID_MAX_HEIGHT = 320;
const GRID_TILE = 76;
const PREVIEW_MAX_HEIGHT = 220;

type FileHeaderProps = {
  files: File[];
  totalSize: number;
  onClear: () => void;
  reselectUploadProps?: UploadProps;
  showReselect: boolean;
};

const FileListHeader: React.FC<FileHeaderProps> = ({
  files,
  totalSize,
  onClear,
  reselectUploadProps,
  showReselect,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderBottom: '1px solid #f0f0f0',
      background: '#fff',
      flexShrink: 0,
    }}
  >
    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
      共 <Typography.Text strong>{files.length}</Typography.Text> 个文件
      <span style={{ margin: '0 6px' }}>·</span>
      合计 {formatFileSize(totalSize)}
    </Typography.Text>
    <Space size={4}>
      {showReselect && reselectUploadProps ? (
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
        onClick={onClear}
        style={{ padding: 0, height: 'auto' }}
      >
        清空全部
      </Button>
    </Space>
  </div>
);

function useObjectUrl(file: File | null, enabled: boolean) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!file || !enabled) {
      setUrl(undefined);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, enabled]);

  return url;
}

type GridTileProps = {
  file: File;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
};

const GridTile: React.FC<GridTileProps> = ({
  file,
  selected,
  onSelect,
  onRemove,
}) => {
  const url = useObjectUrl(file, isImageFile(file));

  return (
    <div
      style={{
        position: 'relative',
        width: GRID_TILE,
        height: GRID_TILE,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        aria-label={`选择 ${file.name}`}
        aria-pressed={selected}
        onClick={onSelect}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 6,
          border: selected ? '2px solid #1890ff' : '1px solid #f0f0f0',
          overflow: 'hidden',
          cursor: 'pointer',
          padding: 0,
          background: '#fafafa',
          boxShadow: selected
            ? '0 0 0 2px rgba(24, 144, 255, 0.15)'
            : undefined,
        }}
      >
        {url ? (
          <img
            src={url}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8c8c8c',
            }}
          >
            <FileOutlined />
          </div>
        )}
      </button>
      <Button
        type="primary"
        danger
        size="small"
        icon={<DeleteOutlined />}
        aria-label={`删除 ${file.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          minWidth: 22,
          width: 22,
          height: 22,
          padding: 0,
          fontSize: 11,
          opacity: 0.92,
        }}
      />
    </div>
  );
};

type ImageGridPanelProps = {
  files: File[];
  onChange: (files: File[]) => void;
};

const ImageGridPanel: React.FC<ImageGridPanelProps> = ({ files, onChange }) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (files.length === 0) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey((prev) => {
      if (prev && files.some((f) => fileStableKey(f) === prev)) return prev;
      return fileStableKey(files[0]);
    });
  }, [files]);

  const selectedFile = useMemo(
    () => files.find((f) => fileStableKey(f) === selectedKey) ?? files[0],
    [files, selectedKey],
  );

  const previewUrl = useObjectUrl(selectedFile ?? null, !!selectedFile);
  const path = selectedFile ? fileRelativePath(selectedFile) : '';
  const showPath = !!selectedFile && path !== selectedFile.name;

  return (
    <div
      style={{ background: '#fff', display: 'flex', flexDirection: 'column' }}
    >
      {selectedFile ? (
        <div
          style={{
            padding: '12px 12px 8px',
            borderBottom: '1px solid #f0f0f0',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 120,
              maxHeight: PREVIEW_MAX_HEIGHT,
              marginBottom: 8,
              background: '#fafafa',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt={selectedFile.name}
                style={{ maxHeight: PREVIEW_MAX_HEIGHT, objectFit: 'contain' }}
                preview={{ mask: '全屏预览' }}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="无法预览"
              />
            )}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <Typography.Text
                strong
                ellipsis={{ tooltip: selectedFile.name }}
                style={{ display: 'block', fontSize: 13 }}
              >
                {selectedFile.name}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {showPath ? `${path} · ` : ''}
                {formatFileSize(selectedFile.size)}
              </Typography.Text>
            </div>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onChange(removeFileFromList(files, selectedFile))}
            >
              删除此项
            </Button>
          </div>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, marginTop: 6, display: 'block' }}
          >
            点击下方缩略图切换预览，无需逐张全屏查看
          </Typography.Text>
        </div>
      ) : null}

      <div
        style={{
          padding: 12,
          maxHeight: GRID_MAX_HEIGHT,
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {files.map((file) => {
            const key = fileStableKey(file);
            return (
              <GridTile
                key={key}
                file={file}
                selected={key === selectedKey}
                onSelect={() => setSelectedKey(key)}
                onRemove={() => onChange(removeFileFromList(files, file))}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

type ListRowThumbProps = {
  file: File;
  showImagePreview: boolean;
};

const ListRowThumb: React.FC<ListRowThumbProps> = ({
  file,
  showImagePreview,
}) => {
  const url = useObjectUrl(file, showImagePreview && isImageFile(file));
  if (url) {
    return (
      <img
        src={url}
        alt={file.name}
        style={{
          width: 40,
          height: 40,
          objectFit: 'cover',
          borderRadius: 4,
          flexShrink: 0,
        }}
      />
    );
  }
  const isZip = file.name.toLowerCase().endsWith('.zip');
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 4,
        background: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: isZip ? '#fa8c16' : '#8c8c8c',
      }}
    >
      {isZip ? <FileZipOutlined /> : <FileOutlined />}
    </div>
  );
};

type FileListPanelProps = {
  files: File[];
  onChange: (files: File[]) => void;
  showImagePreview: boolean;
  maxHeight: number;
};

const FileListPanel: React.FC<FileListPanelProps> = ({
  files,
  onChange,
  showImagePreview,
  maxHeight,
}) => (
  <List
    size="small"
    dataSource={files}
    style={{ maxHeight, overflowY: 'auto', background: '#fff' }}
    renderItem={(file) => {
      const path = fileRelativePath(file);
      const showPath = path !== file.name;
      const sizeLabel = formatFileSize(file.size);
      return (
        <List.Item
          key={fileStableKey(file)}
          style={{ padding: '8px 12px' }}
          actions={[
            <Button
              key="remove"
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label={`删除 ${file.name}`}
              onClick={() => onChange(removeFileFromList(files, file))}
            />,
          ]}
        >
          <List.Item.Meta
            avatar={
              <ListRowThumb file={file} showImagePreview={showImagePreview} />
            }
            title={
              <Typography.Text
                ellipsis={{ tooltip: file.name }}
                style={{ fontSize: 13 }}
              >
                {file.name}
              </Typography.Text>
            }
            description={
              <Typography.Text
                type="secondary"
                ellipsis={{ tooltip: showPath ? path : sizeLabel }}
                style={{ fontSize: 12, display: 'block' }}
              >
                {showPath ? `${path} · ${sizeLabel}` : sizeLabel}
              </Typography.Text>
            }
          />
        </List.Item>
      );
    }}
  />
);

type BatchFileListProps = {
  files: File[];
  onChange: (files: File[]) => void;
  /** CV 等多图场景：网格 + 选中预览 */
  showImagePreview?: boolean;
  reselectUploadProps?: UploadProps;
  maxHeight?: number;
};

const BatchFileList: React.FC<BatchFileListProps> = ({
  files,
  onChange,
  showImagePreview = false,
  reselectUploadProps,
  maxHeight = LIST_MAX_HEIGHT,
}) => {
  const totalSize = useMemo(() => sumFileSizes(files), [files]);

  if (files.length === 0) {
    return null;
  }

  const showReselect =
    !!reselectUploadProps &&
    (files.length === 1 ||
      files.every((f) => f.name.toLowerCase().endsWith('.zip')));

  const useGridLayout =
    showImagePreview && !showReselect && files.some((f) => isImageFile(f));

  return (
    <div
      style={{
        marginTop: 8,
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        background: '#fafafa',
        overflow: 'hidden',
        flex: 1,
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <FileListHeader
        files={files}
        totalSize={totalSize}
        onClear={() => onChange([])}
        reselectUploadProps={reselectUploadProps}
        showReselect={showReselect}
      />
      {useGridLayout ? (
        <ImageGridPanel files={files} onChange={onChange} />
      ) : (
        <FileListPanel
          files={files}
          onChange={onChange}
          showImagePreview={showImagePreview}
          maxHeight={maxHeight}
        />
      )}
    </div>
  );
};

export default BatchFileList;
