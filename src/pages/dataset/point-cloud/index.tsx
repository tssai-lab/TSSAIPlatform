import { PageContainer } from '@ant-design/pro-components';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { history } from '@umijs/max';
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  message,
  Select,
  Space,
  Spin,
} from 'antd';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import type { DatasetListItem } from '@/services/dataset';
import { fetchDatasetList } from '@/services/platform';
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

type LoadResult = {
  fileName: string;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  pointCount: number;
};

function makePointsMaterial(geometry: THREE.BufferGeometry) {
  const hasColors = !!geometry.getAttribute('color');
  return new THREE.PointsMaterial({
    size: 0.02,
    color: hasColors ? undefined : new THREE.Color('#1890ff'),
    vertexColors: hasColors,
    sizeAttenuation: false,
  });
}

function normalizeGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return { radius: 1 };

  const center = new THREE.Vector3();
  box.getCenter(center);

  const size = new THREE.Vector3();
  box.getSize(size);
  const radius = Math.max(size.x, size.y, size.z) / 2 || 1;

  geometry.translate(-center.x, -center.y, -center.z);
  return { radius };
}

function parsePointCloudBuffer(
  format: PointCloudFileFormat,
  arrayBuffer: ArrayBuffer,
): THREE.BufferGeometry {
  if (format === PointCloudFileFormat.PLY) {
    const loader = new PLYLoader();
    return loader.parse(arrayBuffer);
  }
  const loader = new PCDLoader();
  const parsed: unknown = (
    loader as { parse: (buf: ArrayBuffer, path: string) => unknown }
  ).parse(arrayBuffer, '');
  if (parsed && (parsed as THREE.Points).isPoints) {
    return (parsed as THREE.Points).geometry as THREE.BufferGeometry;
  }
  if (parsed && (parsed as THREE.BufferGeometry).isBufferGeometry) {
    return parsed as THREE.BufferGeometry;
  }
  throw new Error('PCD 文件解析失败');
}

const PointCloudMesh: React.FC<{
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
}> = ({ geometry, material }) => (
  <points geometry={geometry} material={material} frustumCulled={false} />
);

const DatasetPointCloudViewer: React.FC = () => {
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [versionId, setVersionId] = useState<string>();
  const [previewInfo, setPreviewInfo] = useState<PointCloudPreviewInfo | null>(
    null,
  );
  const [zipEntryPath, setZipEntryPath] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoadResult | null>(null);
  const controlsRef = useRef<any>(null);
  const loadAbortRef = useRef<AbortController | null>(null);

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
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.set(0, 0, 0);
    controls.object.position.set(radius * 2, radius * 1.5, radius * 2);
    controls.object.near = Math.max(0.01, radius / 100);
    controls.object.far = Math.max(1000, radius * 100);
    controls.object.updateProjectionMatrix();
    controls.update();
  }, []);

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
      const { radius } = normalizeGeometry(geometry);
      const material = makePointsMaterial(geometry);
      const pointCount = geometry.getAttribute('position').count ?? 0;
      disposeResult();
      setResult({ fileName, geometry, material, pointCount });
      resetView(radius);
    },
    [disposeResult, resetView],
  );

  const loadDatasets = useCallback(async () => {
    setDatasetsLoading(true);
    try {
      const res = await fetchDatasetList({
        type: 'POINT_CLOUD',
        pageSize: 200,
      });
      setDatasets((res?.data ?? []) as DatasetListItem[]);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e));
      setDatasets([]);
    } finally {
      setDatasetsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  const datasetOptions = useMemo(
    () =>
      datasets
        .filter((item) => item.versionId)
        .map((item) => ({
          value: item.versionId as string,
          label: `${item.name} · ${item.fileName || item.version || item.versionId}`,
        })),
    [datasets],
  );

  const zipEntries: PointCloudZipEntry[] = useMemo(
    () => previewInfo?.pointCloudFiles ?? [],
    [previewInfo],
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

  const handleVersionChange = async (nextVersionId: string) => {
    setVersionId(nextVersionId);
    setZipEntryPath(undefined);
    setPreviewInfo(null);
    setError(null);
    disposeResult();
    loadAbortRef.current?.abort();

    if (!nextVersionId) return;

    setLoading(true);
    try {
      const info = await fetchPointCloudPreviewInfo(nextVersionId, {
        skipErrorHandler: true,
      });
      setPreviewInfo(info);

      if (info.previewSupported === false) {
        setError(info.message || '当前文件不支持在线预览');
        return;
      }

      if (info.format === PointCloudPreviewFormat.ZIP) {
        const allowed = (info.pointCloudFiles ?? []).filter(
          (f) => f.previewAllowed,
        );
        if (allowed.length === 1) {
          setZipEntryPath(allowed[0].path);
        }
        return;
      }

      if (info.previewUrl && info.format === PointCloudPreviewFormat.PCD) {
        await loadSingleFile(
          nextVersionId,
          PointCloudFileFormat.PCD,
          info.fileName,
        );
      } else if (
        info.previewUrl &&
        info.format === PointCloudPreviewFormat.PLY
      ) {
        await loadSingleFile(
          nextVersionId,
          PointCloudFileFormat.PLY,
          info.fileName,
        );
      }
    } catch (e: unknown) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleZipEntryLoad = async () => {
    if (!versionId || !zipEntryPath || !previewInfo) return;

    const entry = zipEntries.find((item) => item.path === zipEntryPath);
    if (!entry) {
      message.warning('请选择 zip 内的点云文件');
      return;
    }
    if (!entry.previewAllowed) {
      setError(entry.message || '该文件过大，请下载后本地查看');
      return;
    }

    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoading(true);
    setError(null);
    disposeResult();
    try {
      const blob = await getPointCloudZipFile(versionId, zipEntryPath, {
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

  const handleClear = () => {
    loadAbortRef.current?.abort();
    setVersionId(undefined);
    setZipEntryPath(undefined);
    setPreviewInfo(null);
    setError(null);
    disposeResult();
  };

  return (
    <PageContainer
      title="点云查看"
      subTitle="从已上传的点云数据集选择版本在线预览，支持 .pcd / .ply 及 zip 包内点云。"
      extra={[
        <Button
          key="upload"
          type="primary"
          onClick={() => history.push('/dataset/upload?type=POINT_CLOUD')}
        >
          上传点云
        </Button>,
      ]}
    >
      <div
        style={{
          marginBottom: 16,
          padding: 16,
          borderRadius: 12,
          background: '#fafafa',
          border: '1px solid #f0f0f0',
        }}
      >
        <Space wrap align="start" size="middle">
          <div style={{ minWidth: 320 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              选择点云数据集
            </div>
            <Select
              showSearch
              allowClear
              placeholder="请选择已上传的点云数据集版本"
              style={{ width: '100%', maxWidth: 480 }}
              loading={datasetsLoading}
              options={datasetOptions}
              value={versionId}
              onChange={(value) => {
                if (value) {
                  handleVersionChange(value);
                } else {
                  handleClear();
                }
              }}
              filterOption={(input, option) =>
                (option?.label ?? '')
                  .toString()
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              notFoundContent={
                datasetsLoading ? (
                  <Spin size="small" />
                ) : (
                  <Empty description="暂无点云数据集" />
                )
              }
            />
          </div>

          {previewInfo?.format === PointCloudPreviewFormat.ZIP && (
            <div style={{ minWidth: 280 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>
                zip 内点云文件
              </div>
              <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
                <Select
                  placeholder="请选择要预览的文件"
                  style={{ flex: 1 }}
                  value={zipEntryPath}
                  onChange={setZipEntryPath}
                  options={zipEntries.map((item) => ({
                    value: item.path,
                    label: item.previewAllowed
                      ? `${item.fileName} (${item.format})`
                      : `${item.fileName}（不可预览）`,
                    disabled: !item.previewAllowed,
                  }))}
                />
                <Button
                  type="primary"
                  disabled={!zipEntryPath}
                  onClick={handleZipEntryLoad}
                >
                  加载预览
                </Button>
              </Space.Compact>
            </div>
          )}

          {versionId && (
            <Button onClick={handleClear} style={{ marginTop: 30 }}>
              清除选择
            </Button>
          )}
        </Space>

        {previewInfo?.message &&
          previewInfo.format === PointCloudPreviewFormat.ZIP && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message={previewInfo.message}
            />
          )}
        {error && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message={error}
          />
        )}
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 'calc(100vh - 360px)',
          minHeight: 480,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #f0f0f0',
        }}
      >
        <Canvas style={{ position: 'absolute', inset: 0 }}>
          <color attach="background" args={['#f5f5f5']} />
          <PerspectiveCamera makeDefault position={[2, 2, 2]} fov={60} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 10, 5]} intensity={1.0} />
          <axesHelper args={[1]} />
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
          />
          {result?.geometry && result?.material && (
            <PointCloudMesh
              geometry={result.geometry}
              material={result.material}
            />
          )}
        </Canvas>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse at center, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.06) 70%, rgba(0,0,0,0.12) 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 10,
            width: 340,
            maxWidth: 'calc(100% - 32px)',
            padding: 12,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            fontSize: 12,
            color: 'rgba(0,0,0,0.65)',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 600, color: '#000', marginBottom: 4 }}>
            操作提示
          </div>
          左键旋转，滚轮缩放，右键平移。请先选择已上传的点云数据集；zip
          包需再选包内文件后点击「加载预览」。
        </div>

        {!result && !loading && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 5,
              textAlign: 'center',
              color: 'rgba(0,0,0,0.45)',
            }}
          >
            {datasetOptions.length === 0 && !datasetsLoading
              ? '暂无点云数据集，请点击右上角「上传点云」'
              : '请选择点云数据集以开始预览'}
          </div>
        )}

        {result && (
          <div
            style={{
              position: 'absolute',
              left: 16,
              bottom: 16,
              zIndex: 10,
              width: 300,
              padding: 12,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            }}
          >
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="文件名">
                {result.fileName}
              </Descriptions.Item>
              <Descriptions.Item label="点数">
                {result.pointCount.toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12 }}>
              <Button size="small" onClick={handleClear}>
                清除预览
              </Button>
            </div>
          </div>
        )}

        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              background: 'rgba(255,255,255,0.5)',
            }}
          >
            <Spin size="large" tip="加载点云中…" />
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default DatasetPointCloudViewer;
