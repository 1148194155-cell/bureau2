/**
 * API barrel — re-exports all domain API modules for backward compatibility.
 *
 * Existing imports like `import { fetchSkills } from "../api/api"` continue to work.
 * New code should import from the specific domain module:
 *   import { fetchSkills } from "../api/skills";
 */
export { fetchSkills } from "./skills";
export { fetchModels, createModel, deleteModel } from "./models";
export { fetchApis, createApi, deleteApi } from "./apis";
export {
  fetchKnowledgeBases,
  createKnowledgeBase,
  indexKnowledgeBase,
  deleteKnowledgeBase,
} from "./knowledge";
export { fetchApiKeys, createApiKey, deleteApiKey } from "./apikeys";
export { fetchTemplates } from "./templates";
export {
  listWorkflows,
  getWorkflow,
  saveWorkflow,
  deleteWorkflow,
  runWorkflow,
  loadWorkflow,
} from "./workflows";
export {
  getExecutionStatus,
  cancelExecution,
  stepExecution,
  listExecutionHistory,
  compareExecutions,
  createExecutionSocket,
} from "./executions";
export { aiChat, getBuiltinStatus } from "./ai";
