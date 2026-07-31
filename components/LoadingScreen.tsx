import type { LucideIcon } from "lucide-react";
import ScopeFlowMark from "./ScopeFlowMark";

type Props = {
  title: string;
  text: string;
  icon?: LucideIcon;
  className?: string;
};

export default function LoadingScreen({ title, text, icon: Icon, className = "app-loading" }: Props) {
  return (
    <main className={className} role="status" aria-live="polite">
      <div className="loading-mark">
        <span className="loading-ring" />
        <span className="loading-mark-core">{Icon ? <Icon size={21} /> : <ScopeFlowMark size={23} />}</span>
      </div>
      <strong>{title}</strong>
      <span>{text}</span>
      <span className="loading-dots" aria-hidden="true"><i /><i /><i /></span>
    </main>
  );
}
