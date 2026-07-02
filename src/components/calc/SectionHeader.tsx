import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "orange" | "dark" | "muted" | "accent";

const toneClasses: Record<Tone, string> = {
  orange: "bg-primary text-primary-foreground",
  dark: "bg-secondary text-secondary-foreground",
  muted: "bg-muted text-foreground border border-border",
  accent: "bg-accent text-accent-foreground border border-primary/30",
};

export function SectionHeader({
  title,
  tone = "dark",
  icon,
  actions,
  subtitle,
  className,
}: {
  title: string;
  tone?: Tone;
  icon?: ReactNode;
  actions?: ReactNode;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 rounded-md mb-3",
        "text-xs font-semibold uppercase tracking-wider",
        toneClasses[tone],
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="opacity-90 shrink-0">{icon}</span>}
        <span className="truncate">{title}</span>
        {subtitle && (
          <span className="text-[10px] font-normal normal-case tracking-normal opacity-80 truncate">
            · {subtitle}
          </span>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
    </div>
  );
}
