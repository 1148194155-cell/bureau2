import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ReactFlowProvider, ReactFlow, Background, MiniMap, Controls } from '@xyflow/react';
import React from 'react';

vi.mock('../components/ResourcePanel', () => ({ default: () => React.createElement('div', { 'data-testid': 'resource-panel' }) }));
vi.mock('../components/Toolbar', () => ({ default: () => React.createElement('div', { 'data-testid': 'toolbar' }) }));
vi.mock('../components/AIChat', () => ({ default: () => React.createElement('div', { 'data-testid': 'ai-chat' }) }));

vi.mock('../store/store', () => {
  const { create } = require('zustand');
  return {
    default: create(() => ({
      nodes: [], edges: [],
      skills: [], models: [], apis: [], knowledgeBases: [],
      undoStack: [], redoStack: [],
      executionLogs: [], executionStatus: null, executionId: null,
      runLogOpen: false, setRunLogOpen: () => {},
      selectedNode: null, selectedNodeEl: null,
      setSelectedNode: () => {}, setEdgeMapping: () => {},
      addNode: () => {}, onNodesChange: () => {}, onEdgesChange: () => {},
      onConnect: () => {}, updateNodeData: () => {}, removeNode: () => {},
      undo: () => {}, redo: () => {}, _pushUndo: () => {},
      setSkills: () => {}, setModels: () => {}, setApis: () => {}, setKnowledgeBases: () => {},
      addExecutionLog: () => {}, setExecutionStatus: () => {}, setExecutionId: () => {},
      setCurrentWorkflowId: () => {}, setCurrentWorkflowName: () => {}, clearCanvas: () => {},
      currentWorkflowId: null, currentWorkflowName: 'Untitled',
    })),
  };
});

vi.mock('../api/api', () => ({
  saveWorkflow: async () => ({ id: 1 }),
  listWorkflows: async () => [{ id: 1, name: 'Test' }],
  loadWorkflow: async () => ({ id: 1, name: 'Test', nodes: [], edges: [] }),
  runWorkflow: async () => ({ execution_id: 'test-exec-id' }),
  createExecutionSocket: () => ({ onmessage: null, onerror: null, onclose: null, close: () => {} }),
}));

import Canvas from '../components/Canvas';

describe('Canvas', () => {
  it('renders without crashing', () => {
    const { container } = render(React.createElement(React.StrictMode, null,
      React.createElement(ReactFlowProvider, null,
        React.createElement(Canvas)
      )
    ));
    expect(container.querySelector('.canvas-bg')).toBeTruthy();
  });

  it('supports keyboard Ctrl+S without crashing', () => {
    window.prompt = () => 'MyWorkflow';
    render(React.createElement(React.StrictMode, null,
      React.createElement(ReactFlowProvider, null,
        React.createElement(Canvas)
      )
    ));
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
  });

  it('supports keyboard Ctrl+Z without crashing', () => {
    render(React.createElement(React.StrictMode, null,
      React.createElement(ReactFlowProvider, null,
        React.createElement(Canvas)
      )
    ));
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
  });
});
