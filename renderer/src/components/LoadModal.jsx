import { useState, useEffect } from "react";
import { X, FolderOpen, Clock } from "lucide-react";
import { listWorkflows, loadWorkflow } from "../api/api";
import toast from "react-hot-toast";
import useStore from "../store/store";
import { useI18n } from "../i18n";

export default function LoadModal({ onClose }) {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listWorkflows()
      .then(setWorkflows)
      .catch(() => toast.error(t('loadModal.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const handleSelect = async (wf) => {
    try {
      const data = await loadWorkflow(wf.id);
      useStore.setState({
        nodes: data.nodes || [],
        edges: data.edges || [],
        currentWorkflowId: data.id,
        currentWorkflowName: data.name,
        isDirty: false,
      });
      toast.success(t('toolbar.loaded') + data.name);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || t('loadModal.loadFailed'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
      <div className="bg-surface-850 border border-surface-600/40 rounded-2xl p-6 w-[360px] max-h-[480px] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-sm font-semibold text-surface-200">{t('loadModal.title')}</h3>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-500 hover:text-surface-300 hover:bg-surface-700/40">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {loading && <div className="text-xs text-surface-500 text-center py-8">{t('loadModal.loading')}</div>}
          {!loading && workflows.length === 0 && (
            <div className="text-xs text-surface-500 text-center py-8">{t('loadModal.empty')}</div>
          )}
          {workflows.map(wf => (
            <button key={wf.id} onClick={() => handleSelect(wf)}
              className="w-full text-left px-3 py-2.5 rounded-xl bg-surface-800/50 border border-surface-700/30 hover:border-accent-500/30 hover:bg-surface-750/50 transition-all group">
              <div className="flex items-center gap-2">
                <FolderOpen size={13} className="text-surface-500 group-hover:text-accent-400 shrink-0" />
                <span className="text-xs font-medium text-surface-200 truncate flex-1">{wf.name}</span>
              </div>
              <div className="flex items-center gap-1 mt-1 ml-[21px]">
                <Clock size={10} className="text-surface-600" />
                <span className="text-[10px] text-surface-500">
                  {new Date(wf.updated_at || wf.created_at).toLocaleString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
