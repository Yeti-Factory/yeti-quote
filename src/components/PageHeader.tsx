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
    <div className="mb-6 min-w-0 space-y-3">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold tracking-tight" title={title}>
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 [&>a]:w-full [&>a]:sm:w-auto [&>a>button]:w-full [&>button]:w-full [&>button]:sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
