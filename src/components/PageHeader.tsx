import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 min-w-0">
      <div className="min-w-0 flex-1">
        <h1
          className="truncate whitespace-nowrap text-2xl font-semibold tracking-tight"
          title={title}
        >
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap justify-end gap-2 shrink-0 max-w-[70%]">{actions}</div>
      )}
    </div>
  );
}
