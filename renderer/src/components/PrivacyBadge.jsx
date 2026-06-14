import { Shield, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export default function PrivacyBadge() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  return (
    <div className="fixed bottom-3 left-3 z-50 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-850/90 backdrop-blur border border-emerald-500/20 text-[10px] text-surface-400">
      <Shield size={11} className="text-emerald-400" />
      <span>数据 100% 本地存储</span>
      <span className="w-px h-3 bg-surface-600" />
      <span>无云端上传 · 断网可用</span>
      <span className="w-px h-3 bg-surface-600" />
      {online ? <Wifi size={10} className="text-surface-500" /> : <WifiOff size={10} className="text-amber-400" />}
      <span>{online ? "已联网" : "已离线 — 仍可使用"}</span>
    </div>
  );
}
