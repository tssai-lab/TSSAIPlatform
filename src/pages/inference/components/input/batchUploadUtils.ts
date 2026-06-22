import type { UploadFile } from 'antd';

export function filesToUploadList(files: File[]): UploadFile[] {
  return files.map((file, index) => ({
    uid: `${file.name}-${file.size}-${index}`,
    name: file.name,
    size: file.size,
    originFileObj: file as UploadFile['originFileObj'],
  }));
}

export function collectUploadFiles(fileList: UploadFile[]): File[] {
  const files: File[] = [];
  for (const item of fileList) {
    if (item.originFileObj) {
      files.push(item.originFileObj);
    }
  }
  return files;
}

export function fileStableKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** 合并上传文件（去重，支持多次累计选择） */
export function mergeUploadedFiles(
  existing: File[],
  incoming: File[],
  maxFileBytes?: number,
) {
  let next = incoming;
  if (maxFileBytes) {
    next = next.filter((file) => file.size <= maxFileBytes);
  }
  const map = new Map<string, File>();
  for (const file of existing) {
    map.set(fileStableKey(file), file);
  }
  for (const file of next) {
    map.set(fileStableKey(file), file);
  }
  return Array.from(map.values());
}

export function removeFileFromList(files: File[], target: File) {
  const key = fileStableKey(target);
  return files.filter((file) => fileStableKey(file) !== key);
}

export function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return '-';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = sizeBytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export function sumFileSizes(files: File[]) {
  return files.reduce((sum, file) => sum + file.size, 0);
}

export function isImageFile(file: File) {
  return (
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)
  );
}

export function fileRelativePath(file: File) {
  return file.webkitRelativePath || file.name;
}
