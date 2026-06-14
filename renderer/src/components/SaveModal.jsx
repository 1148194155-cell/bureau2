import { useState, useRef, useEffect } from "react";
import { X, Save } from "lucide-react";
import useStore from "../store/store";
import { useI18n } from "../i18n";

export default function SaveModal({ onSave, onClose }) {
  const { t } = useI18n();
  const currentName = useStore(s => s.currentWorkflowName);
  const [name, setName] = useState(currentName === "Untitled" ? "" : currentName);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/60 backdrop-blur-sm">
      <div className="bg-surface-850 border border-surface-600/40 rounded-2xl p-6 w-80 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-surface-200">{t('saveModal.title')}</h3>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-surface-500 hover:text-surface-300 hover:bg-surface-700/40">
            <X size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('saveModal.placeholder')}
            className="w-full h-9 px-3 rounded-xl bg-surface-750 border border-surface-600/40 text-sm text-surface-200 placeholder:text-surface-600 outline-none focus:border-accent-500/50 mb-4"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose}
              className="h-8 px-4 rounded-xl bg-surface-700 hover:bg-surface-600 text-xs text-surface-300 transition-colors">
              {t('saveModal.cancel')}
            </button>
            <button type="submit" disabled={!name.trim()}
              className="h-8 px-4 rounded-xl bg-accent-600 hover:bg-accent-500 disabled:opacity-40 text-xs text-surface-950 font-medium transition-colors flex items-center gap-1.5">
              <Save size={11} />{t('saveModal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
