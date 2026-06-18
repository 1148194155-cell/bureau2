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
      isDirty: true,
    });
    return id;
  },

  removeNode: (id) => set({
    nodes: get().nodes.filter((n) => n.id !== id),
    edges: get().edges.filter((e) => e.source !== id && e.target !== id),
    isDirty: true,
  }),

  updateNodeData: (id, data) => set({
    nodes: get().nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...data } } : n),
  }),

  clearCanvas: () => set({ nodes: [], edges: [], isDirty: false }),

  addNodes: (newNodes) => set({ nodes: [...get().nodes, ...newNodes], isDirty: true }),
  addEdges: (newEdges) => set({ edges: [...get().edges, ...newEdges], isDirty: true }),

  // --- Undo/Redo ---
  undoStack: [],
  redoStack: [],
  _pushUndo: () => {
    const { nodes, edges, undoStack } = get();
    set({
      undoStack: [...undoStack.slice(-49), { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      redoStack: [],
    });
  },
  undo: () => {
    const { undoStack, nodes, edges } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      nodes: prev.nodes, edges: prev.edges,
    });
  },
  redo: () => {
    const { redoStack, nodes, edges } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      nodes: next.nodes, edges: next.edges,
    });
  },

  // --- Dirty tracking (shared with other slices) ---
  isDirty: false,
  setDirty: (v) => set({ isDirty: v }),
});
