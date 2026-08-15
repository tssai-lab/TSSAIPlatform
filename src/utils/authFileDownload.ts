import { STORAGE_KEYS, storage } from '@/utils/storage';

type AuthFileDownloadParams = {
  /** 相对路径如 /v2/model-versions/{id}/download，或已含 /api 前缀 */
  url: string;
  fileName: string;
  signal?: AbortSignal;
  /** 0~1；未知总长度时为 null */
  onProgress?: (ratio: number | null) => void;
};

function resolveDownloadUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/api/')) return url;
  if (url.startsWith('/')) return `/api${url}`;
  return `/api/${url}`;
}

function isUserAbort(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    String((error as { name?: string }).name) === 'AbortError'
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const json = (await response.json()) as {
        errorMessage?: string;
        message?: string;
        msg?: string;
      };
      return (
        json.errorMessage ||
        json.message ||
        json.msg ||
        `下载失败（HTTP ${response.status}）`
      );
    }
    const text = (await response.text()).trim();
    if (text) return text.slice(0, 200);
  } catch {
    // ignore
  }
  return `下载失败（HTTP ${response.status}）`;
}

function triggerAnchorDownload(blob: Blob, fileName: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 60_000);
}

async function fetchDownloadResponse(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  const token = storage.get<string>(STORAGE_KEYS.TOKEN);
  const response = await fetch(url, {
    method: 'GET',
    headers: token
      ? { Authorization: `Bearer ${typeof token === 'string' ? token : ''}` }
      : undefined,
    signal,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    throw new Error(await readErrorMessage(response));
  }
  return response;
}

type SaveFilePickerOptions = {
  suggestedName?: string;
};

type FileSystemWritableFileStream = WritableStream & {
  write?: (data: Blob | BufferSource | string) => Promise<void>;
  close?: () => Promise<void>;
};

type SaveFileHandle = {
  createWritable: () => Promise<FileSystemWritableFileStream>;
};

function createProgressTransform(
  totalBytes: number,
  onProgress?: (ratio: number | null) => void,
): TransformStream<Uint8Array, Uint8Array> {
  let received = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (onProgress) {
        onProgress(totalBytes > 0 ? Math.min(received / totalBytes, 1) : null);
      }
      controller.enqueue(chunk);
    },
  });
}

async function readBodyAsBlob(
  response: Response,
  onProgress?: (ratio: number | null) => void,
): Promise<Blob> {
  if (!response.body) {
    return response.blob();
  }
  const total = Number(response.headers.get('content-length') || 0);
  const reader = response.body
    .pipeThrough(createProgressTransform(total, onProgress))
    .getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  onProgress?.(1);
  // TS DOM 类型把 Uint8Array.buffer 标成 ArrayBufferLike，与 BlobPart 不兼容，运行时无影响
  return new Blob(chunks as BlobPart[]);
}

/**
 * 带鉴权下载文件。
 *
 * Chromium 安全上下文（HTTPS / localhost）：先弹系统保存框，再边下边写。
 * 其它环境：整包缓冲后再触发 <a download>（完成前靠 onProgress / 页面 loading）。
 */
export async function downloadAuthFile(
  params: AuthFileDownloadParams,
): Promise<void> {
  const fileName = params.fileName.trim() || 'download.bin';
  const url = resolveDownloadUrl(params.url);
  // 一点击就回调，保证页面 toast 立刻出现（保存框弹出前也有反馈）
  params.onProgress?.(null);

  const showSaveFilePicker = (
    window as Window & {
      showSaveFilePicker?: (
        options?: SaveFilePickerOptions,
      ) => Promise<SaveFileHandle>;
    }
  ).showSaveFilePicker;
  const canStreamSave =
    typeof showSaveFilePicker === 'function' &&
    typeof WritableStream !== 'undefined' &&
    window.isSecureContext;

  if (canStreamSave) {
    let fileHandle: SaveFileHandle | null = null;
    try {
      fileHandle = await showSaveFilePicker!({ suggestedName: fileName });
    } catch (error: unknown) {
      if (isUserAbort(error)) {
        throw new Error('已取消下载');
      }
      // 保存框不可用时回退整包下载
    }

    if (fileHandle) {
      const response = await fetchDownloadResponse(url, params.signal);
      if (!response.body) {
        throw new Error('下载响应无内容流');
      }
      const total = Number(response.headers.get('content-length') || 0);
      const writable = await fileHandle.createWritable();
      await response.body
        .pipeThrough(createProgressTransform(total, params.onProgress))
        .pipeTo(writable);
      params.onProgress?.(1);
      return;
    }
  }

  const response = await fetchDownloadResponse(url, params.signal);
  const blob = await readBodyAsBlob(response, params.onProgress);
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('下载文件为空');
  }
  triggerAnchorDownload(blob, fileName);
}
