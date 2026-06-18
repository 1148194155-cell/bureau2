/**
 * Execution store slice — execution status, logs, results, workflow meta。
 * @since 2025-01 阶段3：从单个 store.js 拆分。
 */
export const executionSlice = (set, get) => ({
  // --- Execution ---
  executionId: null,
  executionLogs: [],
  executionStatus: null,
  nodeExecutionState: {},
  executionResults: [],
  executionHistory: [],
  setExecutionId: (id) => set({ executionId: id, executionLogs: [], executionStatus: "running", nodeExecutionState: {}, executionResults: [] }),
  addExecutionToHistory: (id) => set({ executionHistory: [id, ...get().executionHistory].slice(0, 10) }),
  setExecutionResults: (results) => set({ executionResults: results }),
  addExecutionLog: (log) => set({ executionLogs: [...get().executionLogs, log] }),
  setExecutionStatus: (s) => set({ executionStatus: s }),
  updateNodeExecution: (nodeId, state) => set({ nodeExecutionState: { ...get().nodeExecutionState, [nodeId]: state } }),

  // --- Workflow meta ---
  currentWorkflowId: null,
  currentWorkflowName: "Untitled",
  setCurrentWorkflowId: (id) => set({ currentWorkflowId: id }),
  setCurrentWorkflowName: (n) => set({ currentWorkflowName: n }),

  // --- Output directory ---
  outputDir: "",
  setOutputDir: (d) => set({ outputDir: d }),

  // --- Run log ---
  runLogOpen: false,
  setRunLogOpen: (o) => set({ runLogOpen: o }),
});
