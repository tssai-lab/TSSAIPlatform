// 一次性搬移审计，不冻结后续业务开发；持续回归由 src/services/*.test.mjs 负责。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const root = new URL('../../', import.meta.url);
const contract = JSON.parse(readFileSync(new URL('./code-module-contract.json', import.meta.url), 'utf8'));
for (const expected of contract) {
  const ast = ts.createSourceFile(expected.target, readFileSync(new URL(expected.target, root), 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === expected.name);
  assert.ok(fn, expected.name);
  const body = fn.body.getText(ast).replace(/\r\n/g, '\n').replace(/import\(['"][^'"]+['"]\)/g, 'import(TYPE)');
  assert.equal(createHash('sha256').update(body).digest('hex'), expected.body, `${expected.target}:${expected.name} 函数体改变`);
}
console.log(`已验证 ${contract.length} 个函数体与 G1f 基线完全一致（忽略换行及类型导入路径）。`);
