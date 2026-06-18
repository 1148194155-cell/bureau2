import { useCallback, useRef, useEffect, useMemo } from "react";
import { ReactFlow, MiniMap, Controls, Background, BackgroundVariant } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import toast from "react-hot-toast";
import SkillNode from "./customNodes/SkillNode";
import KnowledgeNode from "./customNodes/KnowledgeNode";
import OutputNode from "./customNodes/OutputNode";
import FileOutputNode from "./customNodes/FileOutputNode";
import InputNode from "./customNodes/InputNode";
import ConditionNode from "./customNodes/ConditionNode";
import CodeNode from "./customNodes/CodeNode";
import ApiNode from "./customNodes/ApiNode";
import ModelNode from "./customNodes/ModelNode";
import WorkflowNode from "./customNodes/WorkflowNode";
import useStore from "../store/store";
import OnboardingOverlay from "./OnboardingOverlay";
import { fetchTemplates } from "../api/api";

const nodeTypes = {
  skill: SkillNode,
  knowledge: KnowledgeNode,
  output: OutputNode,
  file_output: FileOutputNode,
  input: InputNode,
  condition: ConditionNode,
  code: CodeNode,
  api_caller: ApiNode,
  model: ModelNode,
  workflow: WorkflowNode,
};
const defaultEdgeOptions = { style: { stroke: "#3b4148", strokeWidth: 1.5, strokeDasharray: "6 3" }, animated: true };

export default function Canvas() {
  const reactFlowWrapper = useRef(null);
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, setSelectedNode, setEdgeMapping, _pushUndo } = useStore();
  const nodeExecutionState = useStore((s) => s.nodeExecutionState);
  const executionStatus = useStore((s) => s.executionStatus);

  // Augment nodes with execution animation classes
  const animatedNodes = useMemo(() => nodes.map(n => {
    const state = nodeExecutionState[n.id];
    if (!state || state === 'idle') return n;
    const extraClass = {
      running: '!border-amber-400 animate-pulse shadow-amber-500/20 shadow-lg',
      completed: '!border-emerald-400 shadow-emerald-500/15',
      failed: '!border-red-400 shadow-red-500/15',
      skipped: '!border-gray-500 opacity-50',
    }[state] || '';
    return { ...n, className: (n.className || '') + ' ' + extraClass };
  }), [nodes, nodeExecutionState]);

  // Edges animate during execution
  const animatedEdges = useMemo(() => {
    if (executionStatus !== 'running') return edges;
    return edges.map(e => ({
      ...e,
      animated: true,
      style: { ...(e.style || {}), stroke: '#f59e0b', strokeWidth: 2.5 },
    }));
  }, [edges, executionStatus]);

  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/reactflow");
    if (!raw) return;
    _pushUndo();
    const { nodeType, data } = JSON.parse(raw);
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    addNode(nodeType, { label: data.name, description: data.desc || "", skillId: data.id, config: {} }, { x: e.clientX - bounds.left - 80, y: e.clientY - bounds.top - 30 });
    toast.success(data.name, { icon: "+" });
  }, [addNode, _pushUndo]);

  // ── Clipboard paste → auto-create node ──
  useEffect(() => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;

    const onPaste = (e) => {
      // Only handle paste when canvas wrapper is focused or contains focus
      if (!wrapper.contains(document.activeElement) && document.activeElement !== document.body) return;

      const text = (e.clipboardData?.getData('text/plain') || '').trim();
      if (!text) return;

      const bounds = wrapper.getBoundingClientRect();
      const centerX = wrapper.clientWidth / 2 - 80;
      const centerY = wrapper.clientHeight / 2 - 30;
      const pos = { x: centerX + Math.random() * 100 - 50, y: centerY + Math.random() * 100 - 50 };

      // Pattern 1: URL
      if (/^https?:\/\/\S+$/.test(text)) {
        e.preventDefault();
        _pushUndo();
        addNode("api_caller", { label: "API", description: text.slice(0, 80), config: { url: text, method: "GET" } }, pos);
        toast.success("已创建 API 节点", { icon: "🔗" });
        return;
      }

      // Pattern 2: File path (Windows: C:\… D:\… or Unix: /…)
      if (/^[A-Z]:[\\/]\S+$/.test(text) || /^\/\S+$/.test(text)) {
        e.preventDefault();
        _pushUndo();
        addNode("file_output", { label: "文件输出", config: { format: "json", outputDir: "output", fileName: text.split(/[\\/]/).pop() } }, pos);
        toast.success("已创建文件输出节点", { icon: "📄" });
        return;
      }

      // Pattern 3: Code (contains { } or function/const/let/var/import)
      if (/(\{.*\}|=>|function\s|const\s|let\s|var\s|import\s|export\s)/s.test(text) && text.length > 20) {
        e.preventDefault();
        _pushUndo();
        addNode("code", { label: "代码", code: text }, pos);
        toast.success("已创建代码节点", { icon: "⚡" });
        return;
      }

      // Pattern 4: Plain text → input node
      if (text.length < 500) {
        e.preventDefault();
        _pushUndo();
        addNode("input", { label: "输入", input: text }, pos);
        toast.success("已创建输入节点", { icon: "📝" });
        return;
      }
    };

    wrapper.addEventListener('paste', onPaste);
    return () => wrapper.removeEventListener('paste', onPaste);
  }, [_pushUndo, addNode]);

  // ── Auto-load quick start template on first visit ──
  useEffect(() => {
    const QUICK_START_KEY = 'localcanvas_quick_start_loaded';

    async function autoLoadQuickStart() {
      // Skip if user already has nodes or has seen the quick start before
      const { nodes } = useStore.getState();
      if (nodes.length > 0) return;
      if (localStorage.getItem(QUICK_START_KEY)) return;

      try {
        const templates = await fetchTemplates();
        const quickStart = templates.find(t => t.isQuickStart || t.id === 'quick_start');
        if (!quickStart) return;

        // Mark as loaded so we don't reload on every mount
        localStorage.setItem(QUICK_START_KEY, '1');

        // Add unique IDs to nodes and edges
        const nodeIdMap = {};
        const nodesWithIds = quickStart.nodes.map((n, i) => {
          const newId = `qs_${n.id}_${Date.now()}`;
          nodeIdMap[n.id] = newId;
          return { ...n, id: newId, data: { ...n.data, nodeId: newId } };
        });
        const edgesWithIds = quickStart.edges.map((e, i) => ({
          ...e,
          id: `qs_e_${i}_${Date.now()}`,
          source: nodeIdMap[e.source] || e.source,
          target: nodeIdMap[e.target] || e.target,
        }));

        useStore.setState({
          nodes: nodesWithIds,
          edges: edgesWithIds,
          currentWorkflowName: quickStart.name,
          isDirty: false,
        });

        toast.success('✨ 已加载快速体验工作流！点击"运行"试试看', { duration: 4000 });
      } catch {
        // Silently fail — quick start is optional
      }
    }

    // Small delay to let the app initialize
    const timer = setTimeout(autoLoadQuickStart, 500);
    return () => clearTimeout(timer);
  }, []);

  // ── Double-click to configure node ──
  const onNodeDoubleClick = useCallback((_, node) => {
    const el = document.querySelector(`.react-flow__node[id="${node.id}"]`);
    setSelectedNode(node, el);
  }, [setSelectedNode]);

  const onNodesChangeWrapped = useCallback((changes) => {
    if (changes.some((c) => c.type === "remove" || (c.type === "position" && c.dragging === false))) _pushUndo();
    onNodesChange(changes);
  }, [onNodesChange, _pushUndo]);

  const onEdgesChangeWrapped = useCallback((changes) => {
    if (changes.some((c) => c.type === "remove")) _pushUndo();
    onEdgesChange(changes);
  }, [onEdgesChange, _pushUndo]);

  const onConnectWithMapping = useCallback((connection) => {
    _pushUndo();
    const sourceNode = useStore.getState().nodes.find((n) => n.id === connection.source);
    const targetNode = useStore.getState().nodes.find((n) => n.id === connection.target);

    // 简单连接（源只有一个输出字段，目标只有一个输入字段）跳过映射弹窗
    const getFieldsForType = (type, dir) => {
      if (dir === 'source') {
        if (type === "skill") return ["output", "result", "text", "data"];
        if (type === "knowledge") return ["documents", "chunks", "context"];
        if (type === "model") return ["content", "usage", "raw"];
        if (type === "api_caller") return ["body", "status", "headers"];
        if (type === "code") return ["result", "output"];
        return ["output"];
      }
      if (type === "skill") return ["input", "text", "prompt", "data"];
      if (type === "knowledge") return ["query", "search", "filter"];
      if (type === "model") return ["prompt", "system", "input"];
      if (type === "condition") return ["input", "value"];
      if (type === "api_caller") return ["body", "query", "url"];
      return ["input"];
    };
    const sourceFields = getFieldsForType(sourceNode?.type, 'source');
    const targetFields = getFieldsForType(targetNode?.type, 'target');
    if (sourceFields.length <= 1 && targetFields.length <= 1) {
      // 直接连接，设默认映射
      const edgeId = `edge_${connection.source}_${connection.target}_${Date.now()}`;
      onConnect({ ...connection, id: edgeId });
      if (sourceFields[0] && targetFields[0]) {
        setTimeout(() => {
          useStore.getState().setEdgeData(edgeId, {
            mapping: { [targetFields[0]]: sourceFields[0] },
          });
        }, 0);
      }
      return;
    }

    // 复杂连接才弹映射弹窗
    if (sourceNode && targetNode) setEdgeMapping({ source: sourceNode, target: targetNode, connection });
    // onConnect 已在上面的简单路径里调用，这里不应重复
  }, [onConnect, setEdgeMapping, _pushUndo]);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full canvas-bg">
      <OnboardingOverlay />
      <ReactFlow nodes={animatedNodes} edges={animatedEdges}
        onNodesChange={onNodesChangeWrapped} onEdgesChange={onEdgesChangeWrapped}
        onConnect={onConnectWithMapping} onDragOver={onDragOver} onDrop={onDrop}
        onNodeDoubleClick={onNodeDoubleClick} onPaneClick={() => setSelectedNode(null, null)}
        nodeTypes={nodeTypes} defaultEdgeOptions={defaultEdgeOptions}
        fitView deleteKeyCode={["Backspace", "Delete"]}
        connectionMode="loose" /* headless (Playwright) may not fire handle-drag events; use store.onConnect() for tests */
        connectionLineStyle={{ stroke: '#059669', strokeWidth: 2 }}
        multiSelectionKeyCode="Shift" className="!bg-transparent">
        <Controls className="!bg-surface-850 !border-surface-700/40 !rounded-xl !shadow-lg" />
        <MiniMap className="!bg-surface-850 !border-surface-700/40"
          nodeColor={(n) => {
            if (n.type === "skill") return "#059669";
            if (n.type === "knowledge") return "#7c3aed";
            if (n.type === "output") return "#d97706";
            if (n.type === "file_output") return "#14b8a6";
            if (n.type === "input") return "#3b82f6";
            if (n.type === "condition") return "#f97316";
            if (n.type === "code") return "#a855f7";
            if (n.type === "api_caller") return "#06b6d4";
            if (n.type === "model") return "#f43f5e";
            if (n.type === "workflow") return "#8b5cf6";
            return "#6b7280";
          }}
          maskColor="rgba(0,0,0,0.6)" />
        <Background variant={BackgroundVariant.Dots} gap={32} size={0.7} color="#2b3138" />
      </ReactFlow>
    </div>
  );
}
