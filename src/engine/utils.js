/**
 * 通用工具函数，被多个 NodeExecutor 共享。
 * 抽出 cosineSimilarity 避免 executor.js 与 KnowledgeExecutor 之间的循环依赖。
 * @since 2025-01 阶段2：executor.js 拆分后的共享工具。
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
