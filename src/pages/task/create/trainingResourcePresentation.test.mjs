import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTrainingResourceRequest,
  formatMiB,
  resourceStatusPresentation,
} from './trainingResourcePresentation.mjs';

const capability = {
  deviceType: 'NVIDIA_GPU',
  cpu: { requestCores: 1, limitCores: 4 },
  memory: { requestMiB: 2048, limitMiB: 8192 },
  gpu: { metricsComplete: true, safeTotalMemoryMiB: 16384 },
  dataStatus: 'AVAILABLE',
  eligibleNodeCount: 2,
  message: '资源可能变化',
};

test('recommended mode keeps the existing request contract', () => {
  assert.equal(
    undefined,
    buildTrainingResourceRequest('recommended', {}, { gpuCount: 1 }, capability),
  );
});

test('custom mode builds bounded CPU memory GPU and soft memory request', () => {
  assert.deepEqual(
    buildTrainingResourceRequest(
      'custom',
      { cpuCores: 2, memoryMiB: 4096, gpuMemoryLimitMiB: 8192 },
      { gpuCount: 1 },
      capability,
    ),
    { cpuCores: 2, memoryMiB: 4096, gpuCount: 1, gpuMemoryLimitMiB: 8192 },
  );
});

test('custom mode rejects stale GPU details and values outside the plan', () => {
  assert.throws(
    () =>
      buildTrainingResourceRequest(
        'custom',
        { cpuCores: 0.5, memoryMiB: 4096 },
        { gpuCount: 1 },
        capability,
      ),
    /CPU 核数/,
  );
  assert.throws(
    () =>
      buildTrainingResourceRequest(
        'custom',
        { cpuCores: 2, memoryMiB: 4096, gpuMemoryLimitMiB: 1024 },
        { gpuCount: 1 },
        { ...capability, gpu: { ...capability.gpu, metricsComplete: false } },
      ),
    /GPU 显存预算/,
  );
});

test('resource status and memory labels never invent missing values', () => {
  assert.equal('16 GiB', formatMiB(16384));
  assert.equal('无数据', formatMiB(undefined));
  assert.equal('success', resourceStatusPresentation(capability).type);
  assert.equal('error', resourceStatusPresentation(undefined, '接口超时').type);
});
