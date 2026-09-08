/**
 * 本地故障注入夹具：使用真实 React 页面和服务，只替换 Umi 网络/路由上下文。
 * node scripts/qa/read-errors-harness.mjs → http://127.0.0.1:18893
 * 绝不连接后端，所有写接口直接拒绝；不是线上业务验收或成功样例。
 * __qa 控制延迟/错误，用于验证刷新、恢复和迟到响应，不能编入生产入口。
 */
import { build } from 'esbuild';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  stdin: { contents: `
    import React from 'react';
    import '@ant-design/v5-patch-for-react-19';
    import { createRoot } from 'react-dom/client';
    import Metrics from './src/components/TrainingMetricsPanel';
    import CodeList from './src/pages/task/trainingCode/list';
    window.__qa = {
      metrics: 'success', code: 'success', calls: [], held: [],
      release() { this.held.splice(0).forEach(resolve => resolve()); },
    };
    function Harness() {
      const [runId, setRunId] = React.useState('run-a');
      const [input, setInput] = React.useState('');
      return <main style={{padding: 24}}>
        <h1>本地故障注入（无真实后端连接）</h1>
        <button onClick={() => setRunId('run-a')}>测试切换 A</button>
        <button onClick={() => setRunId('run-b')}>测试切换 B</button>
        <button onClick={() => setRunId(undefined)}>测试手动 Run ID</button>
        <section id="metrics"><Metrics runId={runId} taskStatus="running"
          runIdInput={input} onRunIdInputChange={setInput} onManualRunId={setRunId}/></section>
        <section id="code-list"><CodeList/></section>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
  `, resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"', 'process.env.REACT_APP_MLFLOW_BASE_PATH': '"/qa-metrics"' },
  plugins: [{
    name: 'isolated-qa-context',
    setup(builder) {
      builder.onResolve({ filter: /^@umijs\/max$/ }, () => ({ path: 'umi', namespace: 'qa' }));
      builder.onResolve({ filter: /^@\/services\/platform$/ }, () => ({ path: 'platform', namespace: 'qa' }));
      builder.onResolve({ filter: /^@\// }, args => builder.resolve(path.resolve(root, 'src', args.path.slice(2)), { resolveDir: root, kind: args.kind }));
      builder.onLoad({ filter: /^platform$/, namespace: 'qa' }, () => ({
        contents: `export * from './src/services/code'; export * from './src/services/mlflow';`, resolveDir: root,
      }));
      builder.onLoad({ filter: /^umi$/, namespace: 'qa' }, () => ({
        contents: `
          export const useAccess = () => ({isAdmin: false});
          export const history = {push: () => {throw new Error('夹具禁止业务导航');}};
          export async function request(url, options = {}) {
            if (options.method && options.method !== 'GET') throw new Error('夹具禁止写接口');
            const qa = window.__qa;
            qa.calls.push(url);
            if (url.startsWith('/qa-metrics')) {
              const mode = qa.metrics;
              const parsed = new URL(url, location.origin);
              const run = parsed.searchParams.get('run_id');
              if (mode === 'held') await new Promise(resolve => qa.held.push(resolve));
              // 故意允许已取消的迟到响应，检验页面防串数据，而不只依赖网络取消。
              if (mode === 'error') throw new Error('测试指标服务不可用');
              return {metrics: mode === 'empty' || parsed.searchParams.get('metric_key') !== 'train_loss' ? [] : [
                {step: 0, value: run === 'run-b' ? 20 : 2}, {step: 1, value: run === 'run-b' ? 10 : 1}
              ]};
            }
            if (url === '/v2/code-assets') {
              if (qa.code === 'error') throw new Error('测试代码接口不可用');
              return qa.code === 'empty' ? [] : [{id:'a',name:'代码 A'}, {id:'b',name:'代码 B'}];
            }
            const match = url.match(new RegExp('^/v2/code-assets/([ab])/versions$'));
            if (match) {
              if (qa.code === 'partial' && match[1] === 'b') throw new Error('测试部分版本失败');
              return [{id:'version-' + match[1], codeAssetId:match[1], version:1, fileName:'train.py',
                trainingProfile:'cv', approvalStatus:'APPROVED', status:'READY', validationStatus:'VALID', riskLevel:'LOW'}];
            }
            throw new Error('夹具未声明的只读接口: ' + url);
          }
        `,
        resolveDir: root,
      }));
    },
  }],
});
const app = express();
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get('/app.js', (_req, res) => res.type('js').send(result.outputFiles[0].text));
app.get('/', (_req, res) => res.type('html').send('<!doctype html><meta charset="utf-8"><title>读取异常本地测试</title><div id="root"></div><script src="/app.js"></script>'));
app.listen(18893, '127.0.0.1', () => console.log('QA fixture: http://127.0.0.1:18893 (no backend)'));
