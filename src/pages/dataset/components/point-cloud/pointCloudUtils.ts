import * as THREE from 'three';
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { PointCloudFileFormat } from '@/services/pointcloud';

export type PointCloudLoadResult = {
  fileName: string;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  pointCount: number;
};

export function makePointsMaterial(geometry: THREE.BufferGeometry) {
  const hasColors = !!geometry.getAttribute('color');
  return new THREE.PointsMaterial({
    size: 0.02,
    color: hasColors ? undefined : new THREE.Color('#1890ff'),
    vertexColors: hasColors,
    sizeAttenuation: true,
  });
}

export function normalizeGeometry(geometry: THREE.BufferGeometry) {
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

export function parsePointCloudBuffer(
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
