/**
 * Knowledge 检索节点执行器（语义 + 关键词）。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import { getDb } from '../../db.js';
import { cosineSimilarity } from '../utils.js';
import { registerNodeExecutor } from '../registry.js';

class KnowledgeExecutor {
  async execute(node, inputData, ctx) {
    const { onLog } = ctx;
    const kbId = node.data?.config?.knowledgeBaseId || node.data?.kb_id;
    const query = inputData?.query || inputData?.input || JSON.stringify(inputData);
    if (!kbId) throw new Error('Knowledge node missing knowledgeBaseId');

    const db = getDb();
    const embedFn = node.data?._embedFn;
    const rows = db.prepare('SELECT content, file_path, embedding FROM knowledge_chunks WHERE knowledge_base_id = ?').all(kbId);
    if (rows.length === 0) return { query, results: [], note: '知识库为空或尚未索引' };

    const topK = node.data?.config?.topK || 5;
    if (embedFn && rows.some(r => r.embedding)) {
      const validRows = rows.filter(r => r.embedding);
      try {
        const queryEmb = (await embedFn([String(query)]))[0];
        if (queryEmb && queryEmb.length > 0) {
          const scored = validRows.map(r => ({
            content: r.content,
            source: r.file_path,
            score: cosineSimilarity(queryEmb, JSON.parse(r.embedding)),
          }));
          scored.sort((a, b) => b.score - a.score);
          return { query, results: scored.slice(0, topK), retrievalMethod: 'cosine_similarity' };
        }
      } catch (err) {
        onLog('warn', `Embedding 检索失败: ${err.message}，降级为关键词匹配`);
      }
    }

    const keywords = String(query).split(/[\s,，。；;]+/).filter(Boolean);
    const scored = rows.map(r => ({
      content: r.content,
      source: r.file_path,
      score: keywords.length > 0 ? keywords.filter(kw => r.content.toLowerCase().includes(kw.toLowerCase())).length / keywords.length : 0,
    }));
    scored.sort((a, b) => b.score - a.score);
    return { query, results: scored.slice(0, topK), retrievalMethod: 'keyword_match' };
  }
}

registerNodeExecutor('knowledge', new KnowledgeExecutor());
