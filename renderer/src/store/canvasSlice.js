/**
 * Canvas store slice — nodes, edges, undo/redo, dirty flag。
 * @since 2025-01 阶段3：从单个 store.js 拆分为 4 个独立 slice，按需引入。
 */
import { addEdge, applyNodeChanges, applyEdgeChanges } from "@xyflow/react";

let nodeIdCounter = 0;
const nextId = () => "node_" + (++nodeIdCounter);

export const canvasSlice = (set, get) => ({
  // --- ReactFlow ---
  nodes: [],
  edges: [],
  edgeData: {},
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => {
    const state = get();
    const newEdges = applyEdgeChanges(changes, state.edges);
    const newEdgeData = { ...state.edgeData };
    for (const ch of changes) {
      if (ch.type === 'remove' && ch.id) delete newEdgeData[ch.id];
    }
    set({ edges: newEdges, edgeData: newEdgeData });
  },
  onConnect: (connection) => set({ edges: addEdge(connection, get().edges) }),

  addNode: (type, data, position) => {
    const id = nextId();
    set({
      nodes: [...get().nodes, {
        id, type,
        position: position || { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
        data: { ...data, label: data?.label || type, nodeId: id },
      }],
      isDirty: true,
    });
    return id;
  },

  removeNode: (id) => {
    const removedEdges = get().edges.filter((e) => e.source === id || e.target === id);
    const newEdgeData = { ...get().edgeData };
    for (const e of removedEdges) delete newEdgeData[e.id];
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      edgeData: newEdgeData,
      isDirty: true,
    });
  },

  setEdgeData: (id, data) => set({
    edgeData: { ...get().edgeData, [id]: { ...get().edgeData[id], ...data } },
    edges: get().edges.map((e) => e.id === id ? { ...e, data: { ...e.data, ...data } } : e),
  }),
  getEdgeData: (id) => get().edgeData[id],

  updateNodeData: (id, data) => set({
    nodes: get().nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...data } } : n),
  }),

  clearCanvas: () => set({ nodes: [], edges: [], edgeData: {}, isDirty: false }),

  /** Load a complete canvas replacement — nodes, edges, and sync edgeData from edge data payloads */
  loadCanvas: (newNodes, newEdges) => {
    const newEdgeData = {};
    for (const n of newNodes) {
      const match = n.id?.match(/^node_(\d+)$/);
      if (match) nodeIdCounter = Math.max(nodeIdCounter, parseInt(match[1]));
    }
    for (const e of (newEdges || [])) {
      if (e.data && Object.keys(e.data).length > 0) {
        newEdgeData[e.id] = { ...e.data };
      }
    }
    set({ nodes: newNodes, edges: newEdges || [], edgeData: newEdgeData, isDirty: true });
  },

  addNodes: (newNodes) => {
    for (const n of newNodes) {
      const match = n.id?.match(/^node_(\d+)$/);
      if (match) nodeIdCounter = Math.max(nodeIdCounter, parseInt(match[1]));
    }
    set({ nodes: [...get().nodes, ...newNodes], isDirty: true });
  },
  addEdges: (newEdges) => {
    const newEdgeData = { ...get().edgeData };
    for (const e of newEdges) {
      if (e.data && Object.keys(e.data).length > 0) {
        newEdgeData[e.id] = { ...(newEdgeData[e.id] || {}), ...e.data };
      }
    }
    set({ edges: [...get().edges, ...newEdges], edgeData: newEdgeData, isDirty: true });
  },

  // --- Undo/Redo ---
  undoStack: [],
  redoStack: [],
  _pushUndo: () => {
    const { nodes, edges, undoStack } = get();
    set({
      undoStack: [...undoStack.slice(-49), { nodes: structuredClone(nodes), edges: structuredClone(edges), edgeData: structuredClone(get().edgeData) }],
      redoStack: [],
    });
  },
  undo: () => {
    const { undoStack, nodes, edges } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, { nodes: structuredClone(nodes), edges: structuredClone(edges), edgeData: structuredClone(get().edgeData) }],
      nodes: prev.nodes, edges: prev.edges, edgeData: prev.edgeData || {},
    });
  },
  redo: () => {
    const { redoStack, nodes, edges } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, { nodes: structuredClone(nodes), edges: structuredClone(edges), edgeData: structuredClone(get().edgeData) }],
      nodes: next.nodes, edges: next.edges, edgeData: next.edgeData || {},
    });
  },

  // --- Dirty tracking (shared with other slices) ---
  isDirty: false,
  setDirty: (v) => set({ isDirty: v }),
});
