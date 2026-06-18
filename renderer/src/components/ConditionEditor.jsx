import { useState, useMemo } from "react";
import { Plus, Trash2, HelpCircle } from "lucide-react";

const OPERATORS = [
  { value: "==", label: "等于" },
  { value: "!=", label: "不等于" },
  { value: ">", label: "大于" },
  { value: ">=", label: "大于等于" },
  { value: "<", label: "小于" },
  { value: "<=", label: "小于等于" },
  { value: "includes", label: "包含" },
  { value: "startsWith", label: "以...开头" },
  { value: "endsWith", label: "以...结尾" },
  { value: "regex", label: "正则匹配" },
  { value: "truthy", label: "不为空" },
  { value: "falsy", label: "为空" },
];

const LOGIC = [
  { value: "&&", label: "且" },
  { value: "||", label: "或" },
];

/**
 * ConditionEditor — visual condition builder for condition nodes.
 * Props: config, onChange
 */
export default function ConditionEditor({ config = {}, onChange }) {
  const conditions = useMemo(() => config.conditions || [], [config]);
  const logic = config.logic || "&&";

  const addCondition = () => {
    const updated = [...conditions, { field: "", op: "truthy", value: "" }];
    onChange({ ...config, conditions: updated });
  };

  const removeCondition = (index) => {
    const updated = conditions.filter((_, i) => i !== index);
    onChange({ ...config, conditions: updated });
  };

  const updateCondition = (index, key, val) => {
    const updated = conditions.map((c, i) => i === index ? { ...c, [key]: val } : c);
    onChange({ ...config, conditions: updated });
  };

  const toggleLogic = () => {
    onChange({ ...config, logic: logic === "&&" ? "||" : "&&" });
  };

  // Build preview expression
  const previewExpr = useMemo(() => {
    if (conditions.length === 0) return "input (默认通过)";
    const parts = conditions.map(c => {
      const field = c.field || "output";
      switch (c.op) {
        case "==": case "!=": case ">": case ">=": case "<": case "<=":
          return `input.${field} ${c.op} ${JSON.stringify(c.value)}`;
        case "includes":
          return `String(input.${field}).includes("${c.value}")`;
        case "startsWith":
          return `String(input.${field}).startsWith("${c.value}")`;
        case "endsWith":
          return `String(input.${field}).endsWith("${c.value}")`;
        case "regex":
          return `/\\b${c.value}\\b/.test(String(input.${field}))`;
        case "truthy":
          return `!!input.${field}`;
        case "falsy":
          return `!input.${field}`;
        default:
          return `input.${field} ${c.op} ${c.value}`;
      }
    });
    return parts.join(` ${logic} `);
  }, [conditions, logic]);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.label}>条件规则</span>
        <HelpCircle size={14} style={{ color: "#94a3b8", cursor: "help" }} title="基于上游节点的输出数据判断" />
      </div>

      {conditions.length === 0 ? (
        <div style={s.empty}>尚无条件，全部数据通过</div>
      ) : (
        conditions.map((cond, i) => (
          <div key={i} style={s.row}>
            {i > 0 && (
              <button onClick={toggleLogic} style={s.logicBtn}>
                {logic === "&&" ? "AND" : "OR"}
              </button>
            )}
            <input
              placeholder="字段名"
              value={cond.field}
              onChange={e => updateCondition(i, "field", e.target.value)}
              style={{ ...s.input, width: 80 }}
            />
            <select
              value={cond.op}
              onChange={e => updateCondition(i, "op", e.target.value)}
              style={{ ...s.input, width: 100 }}
            >
              {OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            {!["truthy", "falsy"].includes(cond.op) && (
              <input
                placeholder="值"
                value={cond.value}
                onChange={e => updateCondition(i, "value", e.target.value)}
                style={{ ...s.input, flex: 1 }}
              />
            )}
            <button onClick={() => removeCondition(i)} style={s.delBtn}>
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}

      <button onClick={addCondition} style={s.addBtn}>
        <Plus size={14} /> 添加条件
      </button>

      <div style={s.preview}>
        <div style={s.previewLabel}>表达式预览</div>
        <code style={s.previewCode}>{previewExpr}</code>
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: "8px 0" },
  header: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: "12px", fontWeight: 600, color: "#475569" },
  label: {},
  empty: { fontSize: "12px", color: "#94a3b8", padding: "8px 0" },
  row: { display: "flex", alignItems: "center", gap: 4, marginBottom: 4 },
  logicBtn: { border: "1px solid #6366f1", background: "#eef2ff", color: "#6366f1", borderRadius: 4, padding: "2px 6px", fontSize: "10px", fontWeight: 700, cursor: "pointer" },
  input: { border: "1px solid #e2e8f0", borderRadius: 4, padding: "4px 6px", fontSize: "12px", outline: "none", background: "#fff" },
  delBtn: { border: "none", background: "none", cursor: "pointer", padding: 2, color: "#ef4444", borderRadius: 4 },
  addBtn: { border: "1px dashed #cbd5e1", background: "none", cursor: "pointer", padding: "4px 10px", borderRadius: 6, fontSize: "12px", color: "#6366f1", display: "flex", alignItems: "center", gap: 4, marginTop: 4, width: "100%", justifyContent: "center" },
  preview: { marginTop: 10, padding: "8px 10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" },
  previewLabel: { fontSize: "11px", color: "#64748b", marginBottom: 4 },
  previewCode: { fontSize: "11px", color: "#334155", fontFamily: "monospace", wordBreak: "break-all" },
};
