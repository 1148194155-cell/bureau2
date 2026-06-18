/**
 * Node executor registry — strategy pattern.
 * 执行器通过 registerNodeExecutor() 注册，export function getNodeExecutor(type) 按类型获取。
 * @since 2025-01 阶段2：替代 executor.js 中 300+ 行的 buildExecutor switch。
 */
const registry = new Map();

export function registerNodeExecutor(type, executor) {
  registry.set(type, executor);
}

export function getNodeExecutor(type) {
  const exec = registry.get(type);
  if (!exec) throw new Error(`Unknown node type: ${type}`);
  return exec;
}

export function getRegisteredTypes() {
  return [...registry.keys()];
}
