/**
 * Input / Output 节点执行器。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import { registerNodeExecutor } from '../registry.js';

class InputOutputExecutor {
  async execute(node, inputData, ctx) {
    if (node.type === 'input') {
      return node.data?.input || inputData || {};
    }
    // output
    return inputData;
  }
}

registerNodeExecutor('input', new InputOutputExecutor());
registerNodeExecutor('output', new InputOutputExecutor());
