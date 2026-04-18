import { request } from '@umijs/max';

export async function fileHealth(options?: { [key: string]: any }) {
  return request<{ data: { minio: string } }>('/api/files/health', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function uploadObject(
  file: File,
  objectName?: string,
  options?: { [key: string]: any },
) {
  const formData = new FormData();
  formData.append('file', file);
  if (objectName) {
    formData.append('objectName', objectName);
  }
  return request<{ data: { objectName: string; size: number; etag: string } }>('/api/files/upload', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}

export function getDownloadUrl(objectName: string) {
  return `/api/files/download?objectName=${encodeURIComponent(objectName)}`;
}

export async function deleteObject(objectName: string, options?: { [key: string]: any }) {
  return request<{ data: { objectName: string; deleted: boolean } }>('/api/files/delete', {
    method: 'DELETE',
    params: { objectName },
    ...(options || {}),
  });
}

