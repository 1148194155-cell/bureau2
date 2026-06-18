/**
 * Resource store slice — skills, models, apis, knowledgeBases, apiKeys。
 * @since 2025-01 阶段3：从单个 store.js 拆分。
 */
export const resourceSlice = (set, get) => ({
  // --- Resources ---
  skills: [],
  models: [],
  apis: [],
  knowledgeBases: [],
  apiKeys: [],
  setSkills: (v) => set({ skills: v }),
  setModels: (v) => set({ models: v }),
  setApis: (v) => set({ apis: v }),
  setKnowledgeBases: (v) => set({ knowledgeBases: v }),
  setApiKeys: (v) => set({ apiKeys: v }),
});
