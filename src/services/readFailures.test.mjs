import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as compatibility from '../utils/apiCompatibility.mjs';
import * as receipt from '../utils/codeUploadReceipt.mjs';
import * as pagination from './paginatedCandidates.mjs';
import * as metricHistory from './mlflowMetricHistory.mjs';

// 直接执行产品服务，替换网络和浏览器存储；不复制被测读取逻辑。
function load(file, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, process: { env: {} }, FormData, Blob, URLSearchParams, console,
    require(name) { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return exports;
}

function metrics(request) {
  return load('./mlflow.ts', {
    '@umijs/max': { request },
    '@/constants/platform': { API_CONFIG: { ENDPOINTS: { MLFLOW_METRICS_HISTORY: '/metrics' } } },
    '@/utils/trainingMetrics': { TRAINING_MLFLOW_METRIC_KEYS: ['train_loss', 'val_accuracy'] },
    './mlflowMetricHistory.mjs': metricHistory,
  });
}

test('指标：成功空记录才查别名，保留零值、去重和排序', async () => {
  const calls = [];
  const service = metrics(async url => {
    const key = new URL(url, 'http://local').searchParams.get('metric_key');
    calls.push(key);
    return { metrics: key === 'loss' ? [
      { step: 2, value: 2 }, { step: 0, value: 0 }, { step: 2, value: 1 },
    ] : [] };
  });
  const result = await service.fetchMlflowMetricsBulk('run /1', ['train_loss']);
  assert.deepEqual(calls, ['train_loss', 'loss']);
  assert.equal(JSON.stringify(result.train_loss), '[{"step":0,"value":0},{"step":2,"value":1}]');
});

test('指标：所有别名正常为空、可选 metrics 缺省仍可返回空结果', async () => {
  for (const payload of [{ metrics: [] }, {}]) {
    const result = await metrics(async () => payload).fetchMlflowMetricsBulk('run', ['train_loss', 'custom']);
    assert.equal(result.custom.length, 0);
    assert.equal(result.train_loss.length, 0);
  }
});

test('指标：网络/鉴权/服务器/取消错误不吞掉，也不继续请求别名', async () => {
  for (const key of ['train_loss', 'custom']) {
    for (const failure of [new Error('timeout'), new Error('cancelled'), ...[401, 403, 404, 429, 500, 503].map(status => ({ response: { status } }))]) {
      let calls = 0;
      const service = metrics(async () => { calls++; throw failure; });
      await assert.rejects(service.fetchMlflowMetricsBulk('run', [key]), error => error === failure);
      assert.equal(calls, 1);
    }
  }
});

test('指标：错误响应结构不能伪装成空数据', async () => {
  for (const payload of [null, 'gateway error', [], { metrics: {} }, { metrics: null }, { error_code: 'INTERNAL_ERROR' }, { success: false }, { errorCode: 'DENIED', metrics: [] }]) {
    for (const key of ['train_loss', 'custom']) {
      await assert.rejects(metrics(async () => payload).fetchMlflowMetricsBulk('run', [key]), /指标.*响应/);
    }
  }
});

test('指标：多指标只有一项失败也必须报告失败，不返回假的完整结果', async () => {
  const failure = new Error('offline');
  await assert.rejects(metrics(async url => {
    if (url.includes('metric_key=custom')) throw failure;
    return { metrics: [{ step: 1, value: 0.5 }] };
  }).fetchMlflowMetricsBulk('run', ['train_loss', 'custom']), error => error === failure);
});

const version = id => ({ codeVersionId: id, codeAssetId: 'asset', codeName: '训练代码', trainingProfile: 'cv', validationStatus: 'VALID', riskLevel: 'LOW' });
function inventory({ assets = [], versions = async () => [], request = async () => assert.fail('不应调用 legacy'), pending = [] } = {}) {
  return load('./code.ts', {
    '@umijs/max': { request }, '@/utils/authFileDownload': {}, '@/constants/trainingCode': {},
    '@/utils/pendingCodeVersions': { listPendingCodeVersions: () => pending },
    '@/utils/codeUploadReceipt.mjs': receipt, '@/utils/apiCompatibility.mjs': compatibility,
    './paginatedCandidates.mjs': pagination,
    './codeV2': {
      listV2CodeAssets: typeof assets === 'function' ? assets : async () => assets,
      listV2CodeAssetVersions: versions,
      mapV2CodeVersionToLegacy: value => value,
      isInternalGeneratedCodeAssetName: () => false,
    },
  });
}

test('本人代码：成功空列表与本地上传登记保持兼容', async () => {
  const empty = await inventory().fetchOwnerCodeVersionInventory();
  assert.equal(empty.success, true); assert.equal(empty.total, 0);
  const local = await inventory({ pending: [{ codeVersionId: 'local', fileName: 'code.zip', source: 'upload' }] }).fetchOwnerCodeVersionInventory();
  assert.equal(local.data[0].codeVersionId, 'local');
});

test('本人代码：部分资产失败保留成功记录并显式声明不完整', async () => {
  const result = await inventory({
    assets: [{ id: 'good', name: 'good' }, { id: 'bad' }],
    versions: async id => { if (id === 'bad') throw new Error('offline'); return [version('v1')]; },
  }).fetchOwnerCodeVersionInventory();
  assert.equal(result.success, true); assert.equal(result.data.length, 1);
  assert.equal(result.incomplete, true); assert.match(result.warningMessage, /1.*2|2.*1/);
});

test('本人代码：全部版本读取失败不以本地登记伪装为成功，也不降级 legacy', async () => {
  for (const status of [401, 403, 404, 500]) {
    await assert.rejects(inventory({
      assets: [{ id: 'a' }], versions: async () => { throw { response: { status } }; },
      pending: [{ codeVersionId: 'local', fileName: 'local.zip' }],
    }).fetchOwnerCodeVersionInventory(), /训练代码.*加载失败/);
  }
});

test('本人代码：V2 入口鉴权/超时/业务 404 不误用旧列表', async () => {
  for (const error of [new Error('timeout'), ...[401, 403, 500].map(status => ({ response: { status } })), { response: { status: 404, data: { errorCode: 'DENIED' } } }]) {
    await assert.rejects(inventory({ assets: async () => { throw error; } }).fetchOwnerCodeVersionInventory(), actual => actual === error);
  }
});

test('本人代码：只有 V2 入口不支持时兼容旧端点', async () => {
  for (const status of [404, 405, 501]) {
    let calls = 0;
    const result = await inventory({
      assets: async () => { throw { response: { status } }; },
      request: async url => { assert.equal(url, '/code/version/list'); calls++; return { success: true, data: [version('old')] }; },
    }).fetchOwnerCodeVersionInventory();
    assert.equal(result.data[0].codeVersionId, 'old'); assert.equal(calls, 1);
  }
});

test('本人代码：错误结构和缺少标识的记录不能静默消失', async () => {
  for (const assets of [null, {}, { errorCode: 'FAILED', data: [] }]) {
    await assert.rejects(inventory({ assets }).fetchOwnerCodeVersionInventory(), /响应/);
  }
  for (const options of [
    { assets: [null] }, { assets: [{}] },
    { assets: [{ id: 'a' }], versions: async () => ({}) },
    { assets: [{ id: 'a' }], versions: async () => [{}] },
  ]) await assert.rejects(inventory(options).fetchOwnerCodeVersionInventory(), /训练代码.*加载失败/);
});

test('本人代码：既有列表包装形式继续可读', async () => {
  for (const wrap of [data => data, data => ({ data }), items => ({ items }), items => ({ data: { items } })]) {
    const result = await inventory({ assets: wrap([{ id: 'a' }]), versions: async () => ({ items: [version('v')] }) }).fetchOwnerCodeVersionInventory();
    assert.equal(result.data[0].codeVersionId, 'v');
  }
});

test('本人代码：降级后旧接口报错或缺少列表也不能伪装成功', async () => {
  for (const payload of [{ success: false, errorMessage: '旧接口不可用', data: [] }, { success: true }, null]) {
    await assert.rejects(inventory({
      assets: async () => { throw { response: { status: 404 } }; },
      request: async () => payload,
    }).fetchOwnerCodeVersionInventory(), /旧接口不可用|响应/);
  }
});

test('结果对比：真实加载回调区分请求失败、指标为空与成功对比', async () => {
  // 仅提取页面中真实回调表达式，隔离大页面其它交互；不重写指标汇总算法。
  const path = new URL('../pages/task/compare/index.tsx', import.meta.url);
  const sourceFile = ts.createSourceFile(path.pathname, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'loadCompareData') initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(initializer, '必须找到页面的真实加载回调');
  const compiled = ts.transpileModule(`exports.load = ${initializer.getText(sourceFile)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const scenario of ['failure', 'empty', 'success', 'partial']) {
    const calls = [], messages = [], snapshots = [];
    const ids = scenario === 'partial' ? ['a', 'b', 'c'] : ['a', 'b'];
    const exports = {};
    vm.runInNewContext(compiled, {
      exports, useCallback: fn => fn, selectedRowKeys: ids, taskList: ids.map(id => ({ id, name: id })),
      MLFLOW_METRIC_KEYS: ['train_loss'],
      fetchTaskDetail: async id => ({ data: { id, name: id, runId: id } }),
      fetchMlflowMetricsBulk: async run => {
        calls.push(run);
        if ((scenario === 'failure' && run === 'b') || (scenario === 'partial' && run === 'c')) throw new Error('offline');
        return { train_loss: scenario === 'empty' ? [] : [{ step: 0, value: 1 }] };
      },
      setMetricsLoading: () => {}, setMetricsData: data => snapshots.push(data),
      message: Object.fromEntries(['info', 'error', 'warning'].map(level => [level, text => messages.push({ level, text })])),
    });
    await exports.load();
    assert.deepEqual(calls, ids);
    if (scenario === 'failure') {
      assert.ok(messages.some(item => item.level === 'error' && /加载失败/.test(item.text)));
      assert.equal(snapshots.at(-1).length, 0);
    } else if (scenario === 'empty') {
      assert.ok(messages.some(item => /没有共同核心指标/.test(item.text)));
    } else {
      assert.equal(snapshots.at(-1).length, 2);
      assert.equal(messages.filter(item => item.level === 'error').length, 0);
      if (scenario === 'partial') assert.ok(messages.some(item => /1 个指标拉取失败/.test(item.text)));
    }
  }
});
