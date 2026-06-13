import { useState, useEffect } from "react";
import CanvasPage from "./pages/CanvasPage";
import SettingsPage from "./pages/SettingsPage";
import { Settings, Layers, Zap } from "lucide-react";
import { useI18n } from "./i18n";
import useStore from "./store/store";

export default function App() {
  const [page, setPage] = useState("canvas");
  const { t, lang, setLang } = useI18n();
  const navigateTo = useStore(s => s.navigateToPage);
  const setNavigateTo = useStore(s => s.setNavigateToPage);

  useEffect(() => {
    if (navigateTo) { setPage(navigateTo); setNavigateTo(null); }
  }, [navigateTo]);

  return (
    <div className="h-full flex flex-col bg-surface-950">
      {/* Navigation */}
      <nav className="h-10 shrink-0 bg-surface-850 border-b border-surface-700/40 flex items-center px-3 select-none">
        <div className="flex items-center gap-2 mr-4">
          <div className="w-6 h-6 rounded-lg bg-accent-500/15 flex items-center justify-center">
            <Zap size={12} className="text-accent-400" />
          </div>
          <span className="text-xs font-semibold text-surface-300 tracking-wide">Local Canvas</span>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setPage("canvas")}
            className={"h-7 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all " + (
              page === "canvas" ? "bg-accent-500/10 text-accent-300" : "text-surface-400 hover:text-surface-200 hover:bg-surface-700/40"
            )}
          >
            <Layers size={13} />{t('nav.canvas')}
          </button>
          <button
            onClick={() => setPage("settings")}
            className={"h-7 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all " + (
              page === "settings" ? "bg-accent-500/10 text-accent-300" : "text-surface-400 hover:text-surface-200 hover:bg-surface-700/40"
            )}
          >
            <Settings size={13} />{t('nav.settings')}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            className="text-[10px] text-surface-500 hover:text-surface-300 px-1"
          >
            {lang === 'en' ? '中' : 'EN'}
          </button>
          <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
          <span className="text-[10px] text-surface-500">{t('nav.version')}</span>
        </div>
      </nav>

      <div className="flex-1 overflow-hidden">
        <div style={{ display: page === "canvas" ? "flex" : "none" }} className="h-full flex-col">
          <CanvasPage />
        </div>
        <div style={{ display: page === "settings" ? "flex" : "none" }} className="h-full flex-col">
          <SettingsPage />
        </div>
      </div>
    </div>
  );
}
