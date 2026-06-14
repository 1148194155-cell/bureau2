import { useCallback, useRef } from "react";
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
import useStore from "../store/store";
import OnboardingOverlay from "./OnboardingOverlay";

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
};
const defaultEdgeOptions = { style: { stroke: "#3b4148", strokeWidth: 1.5, strokeDasharray: "6 3" }, animated: true };

export default function Canvas() {
  const reactFlowWrapper = useRef(null);
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, setSelectedNode, setEdgeMapping, _pushUndo } = useStore();

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
    onConnect(connection);
  }, [onConnect, setEdgeMapping, _pushUndo]);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full canvas-bg">
      <OnboardingOverlay />
      <ReactFlow nodes={nodes} edges={edges}
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
            return "#6b7280";
          }}
          maskColor="rgba(0,0,0,0.6)" />
        <Background variant={BackgroundVariant.Dots} gap={32} size={0.7} color="#2b3138" />
      </ReactFlow>
    </div>
  );
}
