const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../frontend/node_modules/typescript');
const runtime = require('../frontend/node_modules/react/jsx-runtime');
const states = [], refs = [];
let si = 0, ri = 0;
const mockReact = {
 useState(initial) { const index = si++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
 useRef(initial) { const index = ri++; return refs[index] ||= { current: initial }; },
 useEffect() {}, useMemo(fn) { return fn(); },
};
const source = fs.readFileSync(`${__dirname}/../frontend/src/pages/manual-label/index.tsx`, 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const mod = { exports: {} };
new Function('exports','module','require',output)(mod.exports,mod,name => {
 if (name === 'react') return mockReact;
 if (name === 'react/jsx-runtime') return runtime;
 if (name === '@umijs/max') return { useParams: () => ({}), useModel: () => ({ initialState: { currentUser: { id: 'test' } } }), Link: 'Link' };
 if (name === 'antd') return { Button: 'Button', Input: 'Input', Select: 'Select', message: { success() {}, warning() {} } };
 if (name.endsWith('.less')) return { default: {} };
 return {};
});
function render() { si=0;ri=0;return mod.exports.default(); }
function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node,...nodes(node.props?.children)]; }
render();
states[4]=[{ id:'img',name:'test.jpg',kind:'image',source:'data:image/jpeg;base64,AA==',marks:[{label:'原标签',start:100,end:200,y:100,height:200,details:{product:'蜡烛',quality_status:'异常',defect_type:'其他异常',note:''}}],done:true }];
states[5]='img';
let tree=nodes(render());
const rect=tree.find(n=>n.type==='rect' && n.props.onPointerDown);
rect.props.onPointerDown({stopPropagation(){}});
tree=nodes(render());
assert.equal(tree.find(n=>n.props?.id==='product').props.value,'蜡烛');
tree.find(n=>n.props?.id==='defect').props.onChange('缺损');
tree=nodes(render());
tree.find(n=>n.props?.children==='应用到所选标注').props.onClick();
const mark=states[4][0].marks[0];
assert.equal(mark.details.defect_type,'缺损');
assert.equal(mark.label,'蜡烛 · 异常 · 缺损');
assert.deepEqual([mark.start,mark.end,mark.y,mark.height],[100,200,100,200]);
assert.equal(states[4][0].done,false);
assert.equal(states[4][0].marks.length,1);
console.log('框选编辑交互检查通过：选中矩形、回填属性、修改缺陷、应用更新，几何保持不变且不新增重复框');
