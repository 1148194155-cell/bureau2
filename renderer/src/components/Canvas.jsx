import { useCallback, useRef } from "react";
import { ReactFlow, MiniMap, Controls, Background, BackgroundVariant } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import toast from "react-hot-toast";
import SkillNode from "./customNodes/SkillNode";
import KnowledgeNode from "./customNodes/KnowledgeNode";
import OutputNode from "./customNodes/OutputNode";
import FileOutputNode from "./customNodes/FileOutputNode";
import useStore from "../store/store";

const nodeTypes = { skill: SkillNode, knowledge: KnowledgeNode, output: OutputNode, file_output: FileOutputNode };
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
    if (sourceNode && targetNode) setEdgeMapping({ source: sourceNode, target: targetNode, connection });
    onConnect(connection);
  }, [onConnect, setEdgeMapping, _pushUndo]);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full canvas-bg">
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
          nodeColor={(n) => { if (n.type === "skill") return "#059669"; if (n.type === "knowledge") return "#7c3aed"; if (n.type === "output") return "#d97706"; if (n.type === "file_output") return "#14b8a6"; return "#6b7280"; }}
          maskColor="rgba(0,0,0,0.6)" />
        <Background variant={BackgroundVariant.Dots} gap={32} size={0.7} color="#2b3138" />
      </ReactFlow>
    </div>
  );
}
