import { create } from "zustand";
import { addEdge, applyNodeChanges, applyEdgeChanges } from "@xyflow/react";

let nodeIdCounter = 0;
const nextId = () => "node_" + (++nodeIdCounter);

const useStore = create((set, get) => ({
  // --- Resources ---
  skills: [], models: [], apis: [], knowledgeBases: [], apiKeys: [],
  setSkills: (v) => set({ skills: v }),
  setModels: (v) => set({ models: v }),
  setApis: (v) => set({ apis: v }),
  setKnowledgeBases: (v) => set({ knowledgeBases: v }),
  setApiKeys: (v) => set({ apiKeys: v }),

  // --- ReactFlow ---
  nodes: [], edges: [],
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) => set({ edges: addEdge(connection, get().edges) }),

  addNode: (type, data, position) => {
    const id = nextId();
    set({
      nodes: [...get().nodes, {
        id, type,
        position: position || { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
        data: { ...data, label: data?.label || type, nodeId: id },
      }],
    });
    return id;
  },

  removeNode: (id) => set({
    nodes: get().nodes.filter((n) => n.id !== id),
    edges: get().edges.filter((e) => e.source !== id && e.target !== id),
  }),

  updateNodeData: (id, data) => set({
    nodes: get().nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...data } } : n),
  }),

  clearCanvas: () => set({ nodes: [], edges: [] }),

  // --- Undo/Redo ---
  undoStack: [], redoStack: [],
  _pushUndo: () => {
    const { nodes, edges, undoStack } = get();
    set({ undoStack: [...undoStack.slice(-49), { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }], redoStack: [] });
  },
  undo: () => {
    const { undoStack, nodes, edges } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
      nodes: prev.nodes, edges: prev.edges,
    });
  },
  redo: () => {
    const { redoStack, nodes, edges } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
      nodes: next.nodes, edges: next.edges,
    });
  },

  // --- Selected node ---
  selectedNode: null, selectedNodeEl: null,
  setSelectedNode: (node, el) => set({ selectedNode: node, selectedNodeEl: el || null }),

  // --- AI Chat (always visible now) ---
  chatMessages: [],
  addChatMessage: (msg) => set({ chatMessages: [...get().chatMessages, msg] }),
  clearChat: () => set({ chatMessages: [] }),

  // --- Edge mapping ---
  edgeMapping: null,
  setEdgeMapping: (m) => set({ edgeMapping: m }),

  setEdgeData: (edgeId, data) => set({
    edges: get().edges.map((e) => e.id === edgeId ? { ...e, data: { ...e.data, ...data } } : e),
  }),

  // --- Execution ---
  executionId: null, executionLogs: [], executionStatus: null,
  setExecutionId: (id) => set({ executionId: id, executionLogs: [], executionStatus: "running" }),
  addExecutionLog: (log) => set({ executionLogs: [...get().executionLogs, log] }),
  setExecutionStatus: (s) => set({ executionStatus: s }),

  // --- Workflow ---
  currentWorkflowId: null, currentWorkflowName: "Untitled",
  setCurrentWorkflowId: (id) => set({ currentWorkflowId: id }),
  setCurrentWorkflowName: (n) => set({ currentWorkflowName: n }),

  // --- Run log ---
  runLogOpen: false,
  setRunLogOpen: (o) => set({ runLogOpen: o }),

  // --- Settings side panel ---
  settingsPanel: null,
  setSettingsPanel: (p) => set({ settingsPanel: p }),

  // --- AI panel width ---
  aiPanelWidth: 400,
  setAiPanelWidth: (w) => set({ aiPanelWidth: Math.max(300, Math.min(500, w)) }),
}));

export default useStore;
