/**
 * Zustand 合并入口 — 将 4 个 domain slice 合并为一个 store。
 * 保持默认导出的向后兼容性，组件无需改 import。
 * @since 2025-01 阶段3：替代原有单体 store.js。
 */
import { create } from "zustand";
import { canvasSlice } from "./canvasSlice";
import { resourceSlice } from "./resourceSlice";
import { executionSlice } from "./executionSlice";
import { uiSlice } from "./uiSlice";

/**
 * Combined Zustand store — merges all domain slices.
 * Backward-compatible default export for existing component imports.
 * Individual slice hooks are also exported for selective imports.
 */
const useStore = create((set, get, api) => ({
  ...canvasSlice(set, get, api),
  ...resourceSlice(set, get, api),
  ...executionSlice(set, get, api),
  ...uiSlice(set, get, api),
}));

export default useStore;
