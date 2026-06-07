import { Alert, Button, Card, message } from 'antd';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  fetchPointCloudPreviewInfo,
  getPointCloudFile,
  getPointCloudZipFile,
  PointCloudFileFormat,
  PointCloudPreviewFormat,
  type PointCloudPreviewInfo,
  type PointCloudZipEntry,
} from '@/services/pointcloud';
import { getApiErrorMessage } from '@/utils/apiError';
import PointCloudCanvas from './PointCloudCanvas';
import PointCloudZipFileList from './PointCloudZipFileList';
import {
  filterInvalidPoints,
  makePointsMaterial,
  normalizeGeometry,
  type PointCloudLoadResult,
  parsePointCloudBuffer,
} from './pointCloudUtils';

export type PointCloudPreviewPanelRef = {
  loadVersion: (version: API.DatasetVersionDetail) => Promise<void>;
  clearSelection: () => void;
};

export type PointCloudPreviewPanelProps = {
  onSelectionChange?: (versionId?: string) => void;
};

const PointCloudPreviewPanel = forwardRef<
  PointCloudPreviewPanelRef,
  PointCloudPreviewPanelProps
>(({ onSelectionChange }, ref) => {
  const [activeVersion, setActiveVersion] =
    useState<API.DatasetVersionDetail | null>(null);
  const [previewInfo, setPreviewInfo] = useState<PointCloudPreviewInfo | null>(
    null,
  );
  const [zipEntryPath, setZipEntryPath] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PointCloudLoadResult | null>(null);
  const controlsRef = useRef<any>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const viewRadiusRef = useRef(1);

  const disposeResult = useCallback(() => {
    setResult((prev) => {
      prev?.geometry.dispose();
      prev?.material.dispose();
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
      disposeResult();
    };
  }, [disposeResult]);

  const resetView = useCallback((radius: number) => {
    viewRadiusRef.current = radius;
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.set(0, 0, 0);
    controls.object.position.set(radius * 2, radius * 1.5, radius * 2);
    controls.object.near = Math.max(0.01, radius / 100);
    controls.object.far = Math.max(1000, radius * 100);
    controls.object.updateProjectionMatrix();
    controls.update();
  }, []);

  useEffect(() => {
    if (!result) return;
    let frameId = 0;
    const tryResetView = () => {
      if (controlsRef.current) {
        resetView(viewRadiusRef.current);
        return;
      }
      frameId = requestAnimationFrame(tryResetView);
    };
    tryResetView();
    return () => cancelAnimationFrame(frameId);
  }, [result, resetView]);

  const loadGeometry = useCallback(
    async (
      fileName: string,
      format: PointCloudFileFormat,
      arrayBuffer: ArrayBuffer,
    ) => {
      const geometry = parsePointCloudBuffer(format, arrayBuffer);
      if (!geometry.getAttribute('position')) {
        throw new Error('点云缺少 position 属性');
      }

      const filterStats = filterInvalidPoints(geometry);
      if (filterStats.removed > 0) {
        console.info('[PointCloud] NaN 过滤', fileName, filterStats);
      }

      const { radius } = normalizeGeometry(geometry, {
        pcdCoordinateFix: format === PointCloudFileFormat.PCD,
      });
      const material = makePointsMaterial(geometry);
      const pointCount = geometry.getAttribute('position').count ?? 0;
      disposeResult();
      setResult({
        fileName,
        geometry,
        material,
        pointCount,
        originalPointCount: filterStats.total,
        removedPointCount: filterStats.removed,
      });
      resetView(radius);
    },
    [disposeResult, resetView],
  );

  const loadSingleFile = useCallback(
    async (
      datasetVersionId: string,
      format: PointCloudFileFormat,
      fileName: string,
    ) => {
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const blob = await getPointCloudFile(datasetVersionId, {
          signal: controller.signal,
          skipErrorHandler: true,
        });
        const buffer = await blob.arrayBuffer();
        await loadGeometry(fileName, format, buffer);
        message.success('点云加载成功');
      } catch (e: unknown) {
        if ((e as Error)?.name !== 'AbortError') {
          setError(getApiErrorMessage(e));
        }
      } finally {
        setLoading(false);
      }
    },
    [loadGeometry],
  );

  const clearSelection = useCallback(() => {
    loadAbortRef.current?.abort();
    setActiveVersion(null);
    setZipEntryPath(undefined);
    setPreviewInfo(null);
    setError(null);
    disposeResult();
    onSelectionChange?.(undefined);
  }, [disposeResult, onSelectionChange]);

  const loadVersion = useCallback(
    async (version: API.DatasetVersionDetail) => {
      loadAbortRef.current?.abort();
      setActiveVersion(version);
      onSelectionChange?.(version.id);
      setZipEntryPath(undefined);
      setPreviewInfo(null);
      setError(null);
      disposeResult();

      setLoading(true);
      try {
        const info = await fetchPointCloudPreviewInfo(version.id, {
          skipErrorHandler: true,
        });
        setPreviewInfo(info);

        if (info.previewSupported === false) {
          setError(info.message || '当前文件不支持在线预览');
          return;
        }

        if (info.format === PointCloudPreviewFormat.ZIP) {
          return;
        }

        if (info.previewUrl && info.format === PointCloudPreviewFormat.PCD) {
          await loadSingleFile(
            version.id,
            PointCloudFileFormat.PCD,
            info.fileName,
          );
        } else if (
          info.previewUrl &&
          info.format === PointCloudPreviewFormat.PLY
        ) {
          await loadSingleFile(
            version.id,
            PointCloudFileFormat.PLY,
            info.fileName,
          );
        }
      } catch (e: unknown) {
        setError(getApiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [disposeResult, loadSingleFile, onSelectionChange],
  );

  useImperativeHandle(ref, () => ({ loadVersion, clearSelection }), [
    loadVersion,
    clearSelection,
  ]);

  const zipEntries: PointCloudZipEntry[] = useMemo(
    () => previewInfo?.pointCloudFiles ?? [],
    [previewInfo],
  );

  const handleZipEntrySelect = (entry: PointCloudZipEntry) => {
    setZipEntryPath(entry.path);
    setError(null);
  };

  const handleZipEntryPreview = async (entry: PointCloudZipEntry) => {
    if (!activeVersion || !previewInfo) return;

    if (!entry.previewAllowed) {
      setError(entry.message || '该文件过大，请下载后本地查看');
      return;
    }

    setZipEntryPath(entry.path);
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoading(true);
    setError(null);
    disposeResult();
    try {
      const blob = await getPointCloudZipFile(activeVersion.id, entry.path, {
        signal: controller.signal,
        skipErrorHandler: true,
      });
      const buffer = await blob.arrayBuffer();
      await loadGeometry(entry.fileName, entry.format, buffer);
      message.success('点云加载成功');
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        setError(getApiErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClearPreview = () => {
    loadAbortRef.current?.abort();
    setError(null);
    disposeResult();
  };

  const versionInfoText = activeVersion
    ? `正在预览：${activeVersion.version}${activeVersion.fileName ? ` · ${activeVersion.fileName}` : ''}`
    : '尚未选择版本，请在上方版本列表点击【选中预览】';

  const selectedZipEntry = zipEntryPath
    ? zipEntries.find((item) => item.path === zipEntryPath)
    : undefined;
  const zipFileInfoText =
    previewInfo?.format === PointCloudPreviewFormat.ZIP && selectedZipEntry
      ? ` · 当前文件：${selectedZipEntry.path}`
      : null;

  const isZipPreview =
    previewInfo?.format === PointCloudPreviewFormat.ZIP &&
    !result &&
    !zipEntryPath;
  const zipHintText = isZipPreview
    ? previewInfo?.message || '请选择包内文件后点击「开始预览」'
    : null;

  const isZipContext = previewInfo?.format === PointCloudPreviewFormat.ZIP;

  const canvasPlaceholder = !activeVersion
    ? '请在版本列表点击【加载预览】'
    : previewInfo?.format === PointCloudPreviewFormat.ZIP && !result
      ? '请在上方列表选择文件并点击「开始预览」'
      : '预览已清除，可再次点击版本列表【加载预览】重新加载';

  return (
    <Card
      id="point-cloud-preview"
      style={{ marginTop: 16 }}
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            minWidth: 0,
          }}
        >
          <span>点云在线预览</span>
          {!isZipContext && (
            <>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 'normal',
                  color: 'rgba(0,0,0,0.45)',
                }}
              >
                支持 110MB 以内的点云文件在线预览
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 'normal',
                  color: activeVersion
                    ? 'rgba(0,0,0,0.65)'
                    : 'rgba(0,0,0,0.45)',
                }}
              >
                {versionInfoText}
              </span>
            </>
          )}
          {isZipContext && (
            <span
              style={{
                fontSize: 14,
                fontWeight: 'normal',
                color: activeVersion ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.45)',
              }}
            >
              {versionInfoText}
              {zipFileInfoText && (
                <span style={{ color: 'rgba(0,0,0,0.65)' }}>
                  {zipFileInfoText}
                </span>
              )}
              {zipHintText && (
                <span style={{ color: 'rgba(0,0,0,0.45)' }}>
                  {' '}
                  · {zipHintText}
                </span>
              )}
            </span>
          )}
        </div>
      }
      extra={
        activeVersion ? (
          <Button onClick={clearSelection}>清除选择</Button>
        ) : undefined
      }
    >
      {previewInfo?.format === PointCloudPreviewFormat.ZIP && (
        <PointCloudZipFileList
          files={zipEntries}
          selectedPath={zipEntryPath}
          onSelect={handleZipEntrySelect}
          onPreview={handleZipEntryPreview}
        />
      )}

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={error}
        />
      )}

      <PointCloudCanvas
        result={result}
        loading={loading}
        placeholder={canvasPlaceholder}
        controlsRef={controlsRef}
        onClearPreview={handleClearPreview}
      />
    </Card>
  );
});

PointCloudPreviewPanel.displayName = 'PointCloudPreviewPanel';

export default PointCloudPreviewPanel;
