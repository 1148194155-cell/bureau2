/**
 * UI store slice — selectedNode, edgeMapping, chat, panels。
 * @since 2025-01 阶段3：从单个 store.js 拆分。
 */
export const uiSlice = (set, get) => ({
  // --- Selected node ---
  selectedNode: null,
  selectedNodeEl: null,
  setSelectedNode: (node, el) => set({ selectedNode: node, selectedNodeEl: el || null }),

  // --- Edge mapping ---
  edgeMapping: null,
  setEdgeMapping: (m) => set({ edgeMapping: m }),
  setEdgeData: (edgeId, data) => set({
    edges: get().edges.map((e) => e.id === edgeId ? { ...e, data: { ...e.data, ...data } } : e),
  }),

  // --- AI Chat ---
  chatMessages: [],
  addChatMessage: (msg) => set({ chatMessages: [...get().chatMessages, msg] }),
  clearChat: () => set({ chatMessages: [] }),

  // --- Settings side panel ---
  settingsPanel: null,
  setSettingsPanel: (p) => set({ settingsPanel: p }),

  // --- Page navigation ---
  navigateToPage: null,
  setNavigateToPage: (p) => set({ navigateToPage: p }),

  // --- AI panel width ---
  aiPanelWidth: 400,
  setAiPanelWidth: (w) => set({ aiPanelWidth: Math.max(300, Math.min(500, w)) }),
});
