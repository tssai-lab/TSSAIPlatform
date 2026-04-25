import { PageContainer } from '@ant-design/pro-components';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { UploadProps } from 'antd';
import { Alert, Button, Descriptions, message, Spin, Upload } from 'antd';
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

const PointCloud: React.FC<{
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
}> = ({ geometry, material }) => {
  return (
    <points geometry={geometry} material={material} frustumCulled={false} />
  );
};

const DatasetPointCloudViewer: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoadResult | null>(null);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      result?.geometry.dispose();
      result?.material.dispose();
    };
  }, [result]);

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

  const parseFile = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'ply' && ext !== 'pcd') {
        throw new Error('目前仅支持 .ply 和 .pcd 格式的文件');
      }

      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.onload = () => {
          const buf = reader.result;
          if (!buf || !(buf instanceof ArrayBuffer)) {
            reject(new Error('文件读取失败'));
            return;
          }
          resolve(buf);
        };
        reader.readAsArrayBuffer(file);
      });

      let geometry: THREE.BufferGeometry;
      if (ext === 'ply') {
        const loader = new PLYLoader();
        geometry = loader.parse(arrayBuffer);
      } else {
        const loader = new PCDLoader();
        const parsed: any = (loader as any).parse(arrayBuffer, '');
        if (parsed && (parsed as any).isPoints) {
          geometry = (parsed as THREE.Points).geometry as THREE.BufferGeometry;
        } else if (parsed && (parsed as any).isBufferGeometry) {
          geometry = parsed as THREE.BufferGeometry;
        } else {
          throw new Error('文件解析失败');
        }
      }

      if (!geometry.getAttribute('position')) {
        throw new Error('文件解析失败');
      }

      const { radius } = normalizeGeometry(geometry);
      const material = makePointsMaterial(geometry);
      const pointCount = geometry.getAttribute('position').count ?? 0;
      resetView(radius);
      return { fileName: file.name, geometry, material, pointCount };
    },
    [resetView],
  );

  const uploadProps: UploadProps = useMemo(
    () => ({
      multiple: false,
      maxCount: 1,
      accept: '.ply,.pcd',
      showUploadList: false,
      beforeUpload: async (file) => {
        setLoading(true);
        setError(null);
        setResult((prev) => {
          prev?.geometry.dispose();
          prev?.material.dispose();
          return null;
        });

        try {
          const r = await parseFile(file as File);
          setResult(r);
          message.success('加载成功');
        } catch (e: any) {
          setError(e?.message ?? '文件解析失败');
        } finally {
          setLoading(false);
        }
        return false;
      },
    }),
    [parseFile],
  );

  const handleClear = useCallback(() => {
    setError(null);
    setResult((prev) => {
      prev?.geometry.dispose();
      prev?.material.dispose();
      return null;
    });
  }, []);

  return (
    <PageContainer
      title="点云查看"
      subTitle="支持 .ply / .pcd 上传并在浏览器中交互查看。"
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 'calc(100vh - 220px)',
          minHeight: 520,
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
            <PointCloud geometry={result.geometry} material={result.material} />
          )}
        </Canvas>

        {/* 轻微暗角与层次，缓解纯白刺眼 */}
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

        {/* 备注信息（与其他页面一致：标题/副标题 + 关键操作提示） */}
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: 20,
            zIndex: 10,
            width: 360,
            maxWidth: 'calc(100% - 40px)',
            padding: 12,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.12)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>操作提示</div>
          <div
            style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', lineHeight: 1.6 }}
          >
            左键旋转，滚轮缩放，右键平移。加载后可在左下角查看文件信息并清除重新上传。
          </div>
        </div>

        {!result && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
              width: 'min(720px, calc(100% - 32px))',
            }}
          >
            <div
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <Upload.Dragger {...uploadProps}>
                <p style={{ margin: 0, fontSize: 14 }}>
                  点击或拖拽点云文件到此区域
                </p>
                <p style={{ margin: '8px 0 0', opacity: 0.7 }}>
                  支持 .ply / .pcd
                </p>
              </Upload.Dragger>
            </div>
            {error && (
              <div style={{ marginTop: 12 }}>
                <Alert type="error" showIcon message={error} />
              </div>
            )}
          </div>
        )}

        {result && (
          <div
            style={{
              position: 'absolute',
              left: 20,
              bottom: 20,
              zIndex: 10,
              width: 320,
              maxWidth: 'calc(100% - 40px)',
              padding: 12,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
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
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button onClick={handleClear}>清除并重新上传</Button>
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
              background: 'rgba(0,0,0,0.25)',
              pointerEvents: 'none',
            }}
          >
            <Spin size="large" />
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default DatasetPointCloudViewer;
