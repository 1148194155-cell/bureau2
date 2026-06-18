import { useState, useEffect } from "react";
import { X, Search, ArrowRight } from "lucide-react";
import useStore from "../store/store";
import toast from "react-hot-toast";

const CATEGORY_ICONS = {
  "文本处理": "📝",
  "开发工具": "💻",
  "知识库": "📚",
  "办公效率": "📋",
  "多模态": "🖼️",
  "API集成": "🔌",
  "工作流": "🔀",
};

export default function TemplateModal({ onClose }) {
  const store = useStore();
  const [templates, setTemplates] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/assets/templates.json")
      .then(r => r.json())
      .then(data => { setTemplates(data); setLoading(false); })
      .catch(() => { setTemplates([]); setLoading(false); toast.error("无法加载模板"); });
  }, []);

  const filtered = filter
    ? templates.filter(t =>
        t.name.includes(filter) ||
        t.description.includes(filter) ||
        t.category.includes(filter)
      )
    : templates;

  const applyTemplate = (template) => {
    const s = useStore.getState();
    // Calculate position offset so nodes don't overlap existing ones
    const maxX = s.nodes.reduce((m, n) => Math.max(m, n.position?.x || 0), -300);
    const maxY = s.nodes.reduce((m, n) => Math.max(m, n.position?.y || 0), -200);
    const offsetX = maxX + 320;
    const offsetY = Math.max(0, maxY - 100);

    const newNodes = template.nodes.map(n => ({
      ...n,
      id: `tpl_${n.id}_${Date.now()}`,
      position: {
        x: (n.position?.x || 0) + offsetX - 100,
        y: (n.position?.y || 0) + offsetY,
      },
    }));

    const idMap = {};
    template.nodes.forEach((n, i) => { idMap[n.id] = newNodes[i].id; });

    const newEdges = template.edges.map(e => ({
      ...e,
      id: `tpl_${e.id}_${Date.now()}`,
      source: idMap[e.source] || e.source,
      target: idMap[e.target] || e.target,
    }));

    s.addNodes(newNodes);
    s.addEdges(newEdges);
    toast.success(`已加载模板: ${template.name}`);
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>📦 工作流模板</h2>
          <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>
        </div>

        <div style={styles.searchBox}>
          <Search size={16} style={{ color: "#94a3b8", flexShrink: 0 }} />
          <input
            placeholder="搜索模板..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {loading ? (
          <div style={styles.loading}>加载中...</div>
        ) : (
          <div style={styles.grid}>
            {filtered.map(tpl => (
              <div key={tpl.id} style={styles.card} onClick={() => applyTemplate(tpl)}>
                <div style={styles.cardIcon}>{tpl.icon}</div>
                <div style={styles.cardBody}>
                  <div style={styles.cardName}>{tpl.name}</div>
                  <div style={styles.cardDesc}>{tpl.description}</div>
                  <div style={styles.cardMeta}>
                    <span style={styles.cardCat}>{CATEGORY_ICONS[tpl.category] || "📌"} {tpl.category}</span>
                    <span style={styles.cardNodes}>{tpl.nodes.length} 节点</span>
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: "#94a3b8", flexShrink: 0 }} />
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={styles.empty}>没有匹配的模板</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 1100,
    background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    width: "600px", maxHeight: "80vh", background: "#fff", borderRadius: "12px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 20px", borderBottom: "1px solid #e2e8f0",
  },
  title: { margin: 0, fontSize: "16px", fontWeight: 600 },
  closeBtn: { border: "none", background: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: "#64748b" },
  searchBox: {
    display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
    borderBottom: "1px solid #e2e8f0", background: "#f8fafc",
  },
  searchInput: {
    border: "none", outline: "none", background: "transparent", flex: 1, fontSize: "14px",
  },
  grid: {
    overflowY: "auto", maxHeight: "55vh", padding: "8px",
  },
  card: {
    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
    borderRadius: 8, cursor: "pointer", transition: "background 0.15s",
    borderBottom: "1px solid #f1f5f9",
  },
  cardIcon: { fontSize: "28px", width: 40, textAlign: "center", flexShrink: 0 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontSize: "14px", fontWeight: 600, color: "#1e293b" },
  cardDesc: { fontSize: "12px", color: "#64748b", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  cardMeta: { display: "flex", gap: 12, marginTop: 4, fontSize: "11px", color: "#94a3b8" },
  cardCat: { color: "#6366f1" },
  cardNodes: { color: "#64748b" },
  loading: { textAlign: "center", padding: 40, color: "#94a3b8" },
  empty: { textAlign: "center", padding: 40, color: "#94a3b8" },
};
