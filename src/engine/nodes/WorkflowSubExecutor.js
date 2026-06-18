/**
 * Workflow 子工作流节点执行器。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import { registerNodeExecutor } from '../registry.js';
import { executeWorkflow, topologicalSort, buildNodeInput } from '../executor.js';

class WorkflowSubExecutor {
  async execute(node, inputData, ctx) {
    const { skills, adapters, onLog, timeout, retryCount, retryDelay, outputDir, workflowId, executionId, getVar, setVar } = ctx;
    const subNodes = node.data?.config?.nodes || node.data?.nodes || [];
    const subEdges = node.data?.config?.edges || node.data?.edges || [];

    if (subNodes.length === 0) throw new Error('Workflow node: no sub-nodes defined');

    // Merge parent input into first node
    const mergedNodes = [...subNodes];
    if (inputData && Object.keys(inputData).length > 0) {
      const firstNode = mergedNodes[0];
      if (firstNode) {
        if (!firstNode.data) firstNode.data = {};
        if (!firstNode.data.input) firstNode.data.input = {};
        firstNode.data.input = { ...inputData, ...firstNode.data.input };
      }
    }

    const result = await executeWorkflow({
      workflow: { nodes: mergedNodes, edges: subEdges },
      skills, adapters, onLog,
      options: { timeout, retryCount, retryDelay, outputDir, workflowId, executionId },
    });
    return result;
  }
}

registerNodeExecutor('workflow', new WorkflowSubExecutor());
