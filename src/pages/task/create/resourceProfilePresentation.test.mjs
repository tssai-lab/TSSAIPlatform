import assert from 'node:assert/strict';
import test from 'node:test';

import {
  firstCpuTrainingResourceProfileId,
  isCpuTrainingResourceProfileIdAllowed,
  listCpuTrainingResourceProfiles,
} from './resourceProfilePresentation.mjs';

test('only exposes CPU profiles while the platform is CPU-only', () => {
  const plan = {
    runtimes: [
      {
        id: 'gpu-runtime',
        deviceType: 'NVIDIA_GPU',
        resourceProfiles: [{ id: 'gpu-1', gpuCount: 1 }],
      },
      {
        id: 'cpu-runtime',
        deviceType: 'CPU',
        resourceProfiles: [
          { id: 'cpu-small', gpuCount: 0 },
          { id: 'invalid-cpu-gpu', gpuCount: 1 },
        ],
      },
    ],
  };

  assert.deepEqual(
    listCpuTrainingResourceProfiles(plan).map((item) => item.id),
    ['cpu-small'],
  );
  assert.equal(firstCpuTrainingResourceProfileId(plan), 'cpu-small');
});

test('empty or GPU-only plans have no selectable CPU profile', () => {
  assert.deepEqual(listCpuTrainingResourceProfiles(undefined), []);
  assert.equal(
    firstCpuTrainingResourceProfileId({
      runtimes: [
        {
          id: 'gpu-runtime',
          deviceType: 'NVIDIA_GPU',
          resourceProfiles: [{ id: 'gpu-1', gpuCount: 1 }],
        },
      ],
    }),
    undefined,
  );
});

test('accepts only the preserved form value that belongs to the current CPU profiles', () => {
  const profiles = [{ id: 'cpu-small' }];

  assert.equal(
    isCpuTrainingResourceProfileIdAllowed(profiles, 'cpu-small'),
    true,
  );
  assert.equal(
    isCpuTrainingResourceProfileIdAllowed(profiles, undefined),
    false,
  );
  assert.equal(isCpuTrainingResourceProfileIdAllowed(profiles, 'gpu-1'), false);
});
