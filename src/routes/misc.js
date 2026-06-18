/**
 * Miscellaneous routes — thin HTTP layer.
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { miscService } from '../services/miscService.js';
import statsRouter from './stats.js';

const router = Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

let _scannerPromise = null, _scannerLastScan = null;

router.get('/health', asyncHandler(async (req, res) => { res.json(await miscService.health()); }));
router.get('/docker/status', async (req, res) => { res.json(await miscService.dockerStatus()); });
router.get('/builtin/status', (req, res) => { const r = miscService.builtinStatus(); res.json({ success: true, data: r.data }); });

router.get('/templates', (req, res) => {
  res.json({ success: true, data: [
    { id:'quick_start', name:'✨ 快速体验', isQuickStart:true, description:'无需配置，立即体验：输入文本 → 代码统计 → 输出结果。',
      nodes:[{ id:'in1',type:'input',position:{x:100,y:150},data:{label:'输入文本',config:{input:'Hello LocalCanvas! 欢迎使用本地 AI 工作流。'}} },{ id:'c1',type:'code',position:{x:400,y:150},data:{label:'文本分析',config:{sandbox:'vm',code:'const text=typeof input==="string"?input:(input.input||input.in1||JSON.stringify(input));const chars=text.length;const charsNoSpaces=text.replace(/\\s/g,"").length;const words=text.split(/[\\s,，。！？、]+/).filter(Boolean).length;const lines=text.split("\\n").length;return{原文:text,字符数:chars,有效字符:charsNoSpaces,词数:words,行数:lines,预览:text.slice(0,50)+(text.length>50?"...":"")};'} } },{ id:'out1',type:'output',position:{x:700,y:150},data:{label:'分析结果'} }],
      edges:[{id:'e1',source:'in1',target:'c1'},{id:'e2',source:'c1',target:'out1'}] },
    { id:'translate', name:'翻译工作流', description:'将用户输入的中文翻译成英文',
      nodes:[{id:'in1',type:'input',position:{x:100,y:100},data:{label:'输入',config:{input:'你好，世界'}}},{id:'m1',type:'model',position:{x:350,y:100},data:{label:'翻译模型',config:{prompt:'把以下内容翻译成英文: {{input}}',temperature:0.3}}},{id:'out1',type:'output',position:{x:600,y:100},data:{label:'输出'}}],
      edges:[{id:'e1',source:'in1',target:'m1'},{id:'e2',source:'m1',target:'out1'}] },
    { id:'summarize', name:'文本摘要', description:'输入长文本，输出精简摘要',
      nodes:[{id:'in1',type:'input',position:{x:100,y:100},data:{label:'输入文章'}},{id:'m1',type:'model',position:{x:350,y:100},data:{label:'摘要模型',config:{prompt:'请用三句话总结以下内容:\n\n{{input}}',temperature:0.5}}},{id:'out1',type:'output',position:{x:600,y:100},data:{label:'摘要输出'}}],
      edges:[{id:'e1',source:'in1',target:'m1'},{id:'e2',source:'m1',target:'out1'}] },
    { id:'code_gen', name:'代码生成', description:'用自然语言描述需求，生成代码并写入文件',
      nodes:[{id:'in1',type:'input',position:{x:100,y:100},data:{label:'需求描述',config:{input:'用 Python 写一个计算斐波那契数列的函数'}}},{id:'m1',type:'model',position:{x:350,y:100},data:{label:'代码模型',config:{prompt:'根据以下需求生成代码，只输出代码不要解释:\n\n{{input}}',temperature:0.2}}},{id:'fo1',type:'file_output',position:{x:600,y:100},data:{label:'保存代码',config:{format:'txt',fileName:'generated_code'}}}],
      edges:[{id:'e1',source:'in1',target:'m1'},{id:'e2',source:'m1',target:'fo1'}] },
  ]});
});

router.post('/scanner/rescan', asyncHandler(async (req, res) => {
  const db = getDb();
  if (_scannerPromise) { await _scannerPromise; return res.json({ success: true, data: { status: 'idle', lastScan: _scannerLastScan } }); }
  const { autoDiscover } = await import('../scanner/autoDiscover.js');
  _scannerPromise = autoDiscover(db).then(() => { _scannerLastScan = new Date().toISOString(); }).catch(err => { _scannerLastScan = new Date().toISOString(); throw err; }).finally(() => { _scannerPromise = null; });
  try { await _scannerPromise; res.json({ success: true, data: { status: 'idle', lastScan: _scannerLastScan } }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
}));

router.get('/git/status', asyncHandler(async (req, res) => {
  const result = await miscService.gitStatus();
  if (result.error) return res.json({ success: false, error: result.error });
  res.json({ success: true, data: result.data });
}));

router.post('/git/save', asyncHandler(async (req, res) => {
  const result = await miscService.gitSave(req.body.message);
  if (result.error) return res.json({ success: false, error: result.error });
  res.json({ success: true, data: result.data });
}));

router.use('/stats', statsRouter);

export default router;
