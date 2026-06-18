/**
 * Condition 条件判断节点执行器（vm runInContext）。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import vm from 'node:vm';
import { registerNodeExecutor } from '../registry.js';

class ConditionExecutor {
  async execute(node, inputData, ctx) {
    const { getVar, setVar } = ctx;
    const expr = node.data?.config?.expression || node.data?.expression || '';
    if (!expr) return { passed: true, value: inputData };

    const condSandbox = {
      input: inputData,
      getVar: getVar || (() => undefined),
      setVar: setVar || (() => {}),
    };
    const condCtx = vm.createContext(condSandbox);
    const condResult = new vm.Script(`(${expr})`).runInContext(condCtx, { timeout: 2000 });
    return { passed: !!condResult, value: inputData };
  }
}

registerNodeExecutor('condition', new ConditionExecutor());
