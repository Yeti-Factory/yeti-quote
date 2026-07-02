import { Card } from "@/components/ui/card";
import { fmtEUR, fmtPct } from "@/lib/format";
import type { CalcOutput, QuantityResult } from "@/lib/calculs/types";
import { AlertTriangle, TrendingUp, TrendingDown, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";

const ROWS: {
  label: string;
  key: keyof QuantityResult;
  fmt?: (v: number) => string;
  emphasize?: boolean;
  group?: "cost" | "sale" | "margin";
}[] = [
  { label: "Prix unitaire achat", key: "prixUnitaireAchat", fmt: fmtEUR, group: "cost" },
  { label: "Prix vente net unitaire", key: "prixVenteNetUnit", fmt: fmtEUR, group: "sale" },
  { label: "Achats total", key: "achatsTotal", fmt: fmtEUR, group: "cost" },
  { label: "Frais fixes", key: "fraisFixes", fmt: fmtEUR, group: "cost" },
  { label: "Comm. sourcing /u", key: "commissionSourcingUnit", fmt: fmtEUR, group: "cost" },
  { label: "Comm. rapporteur /u", key: "commissionRapporteurUnit", fmt: fmtEUR, group: "cost" },
  {
    label: "Comm. rapporteur total",
    key: "commissionRapporteurTotal",
    fmt: fmtEUR,
    group: "cost",
  },
  {
    label: "Total prix unitaire",
    key: "totalPrixUnitaire",
    fmt: fmtEUR,
    emphasize: true,
    group: "sale",
  },
  { label: "Total CA", key: "totalCA", fmt: fmtEUR, emphasize: true, group: "sale" },
  { label: "Total dépenses", key: "totalDepenses", fmt: fmtEUR, group: "cost" },
  { label: "Marge nette", key: "margeNet", fmt: fmtEUR, emphasize: true, group: "margin" },
  { label: "% Marge", key: "margePct", fmt: fmtPct, emphasize: true, group: "margin" },
];

/** Margin band based on effective margin (fractional, 0..1). */
function marginBand(m: number): "danger" | "warn" | "ok" {
  if (m < 0.2) return "danger";
  if (m < 0.3) return "warn";
  return "ok";
}

function bandTextClass(b: "danger" | "warn" | "ok") {
  return b === "danger"
    ? "text-destructive"
    : b === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";
}

function bandBgClass(b: "danger" | "warn" | "ok") {
  return b === "danger"
    ? "bg-destructive/10 border-destructive/40"
    : b === "warn"
      ? "bg-amber-500/10 border-amber-500/40"
      : "bg-emerald-500/10 border-emerald-500/40";
}

function HeroMetrics({ scenarios }: { scenarios: QuantityResult[] }) {
  return (
    <div
      className="grid gap-3 p-4 border-b-2 bg-muted/30"
      style={{ gridTemplateColumns: `repeat(${scenarios.length}, minmax(0, 1fr))` }}
    >
      {scenarios.map((s, i) => {
        const band = marginBand(s.margePct);
        const critical = s.margePct < 0.2;
        return (
          <div
            key={i}
            className={cn(
              "rounded-lg border-2 p-3 space-y-2 relative",
              bandBgClass(band),
              critical && "pulse-alert",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Qté {s.quantite.toLocaleString("fr-FR")}
              </span>
              {band === "ok" ? (
                <TrendingUp className={cn("w-3.5 h-3.5", bandTextClass(band))} />
              ) : band === "warn" ? (
                <Target className={cn("w-3.5 h-3.5", bandTextClass(band))} />
              ) : (
                <TrendingDown className={cn("w-3.5 h-3.5", bandTextClass(band))} />
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Chiffre d'affaires</div>
              <div className="text-lg font-bold tabular-nums">{fmtEUR(s.totalCA)}</div>
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Marge nette</div>
                <div className={cn("text-sm font-semibold tabular-nums", bandTextClass(band))}>
                  {fmtEUR(s.margeNet)}
                </div>
              </div>
              <div className={cn("text-2xl font-bold tabular-nums", bandTextClass(band))}>
                {fmtPct(s.margePct)}
              </div>
            </div>
            {critical && (
              <div className="text-[10px] font-semibold text-destructive flex items-center gap-1 pt-1 border-t border-destructive/30">
                <AlertTriangle className="w-3 h-3" />
                Marge résiduelle &lt; 20 %
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ResultsPanel({ output }: { output: CalcOutput }) {
  const scenarios = output.scenarios.filter((s) => s.quantite > 0);
  if (scenarios.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Saisissez au moins une quantité pour voir les résultats.
      </Card>
    );
  }
  const criticalCount = scenarios.filter((s) => s.margePct < 0.2).length;
  return (
    <Card className="p-0 overflow-hidden calc-section emphasis">
      <div className="p-4 pb-0">
        <SectionHeader title="Résultats" tone="dark" />
      </div>
      <HeroMetrics scenarios={scenarios} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 bg-secondary text-secondary-foreground">
              <th className="text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider">
                Indicateur
              </th>
              {scenarios.map((s, i) => (
                <th
                  key={i}
                  className="text-right px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider"
                >
                  Qté {s.quantite.toLocaleString("fr-FR")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, idx) => {
              const prev = ROWS[idx - 1];
              const groupChanged = prev && prev.group !== r.group;
              return (
                <tr
                  key={r.key as string}
                  className={cn(
                    "border-b",
                    groupChanged && "border-t-2 border-t-border/80",
                    r.emphasize && "bg-primary/5 font-semibold",
                    r.key === "margePct" && "border-t-2 border-t-primary/40 bg-primary/10",
                  )}
                >
                  <td className="px-3 py-2">{r.label}</td>
                  {scenarios.map((s, i) => {
                    const v = s[r.key] as number;
                    const band = marginBand(s.margePct);
                    const isMarginRow = r.key === "margePct" || r.key === "margeNet";
                    return (
                      <td
                        key={i}
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          r.emphasize && "font-semibold",
                          isMarginRow && bandTextClass(band),
                        )}
                      >
                        {r.fmt ? r.fmt(v) : v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {scenarios.some((s) => s.margeContra !== undefined) && (
              <>
                <tr className="border-b bg-muted">
                  <td
                    className="px-3 py-2 text-[11px] uppercase font-semibold tracking-wider text-muted-foreground"
                    colSpan={scenarios.length + 1}
                  >
                    Détail Contra
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2">Marge Contra</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {fmtEUR(s.margeContra!)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2">% Marge Contra</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {fmtPct(s.margeContraPct!)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2">Marge Autres fournisseurs</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {fmtEUR(s.margeAutres!)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-3 py-2">% Marge Autres</td>
                  {scenarios.map((s, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {fmtPct(s.margeAutresPct!)}
                    </td>
                  ))}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {criticalCount > 0 && (
        <div className="px-4 py-3 bg-destructive/15 text-destructive text-sm flex items-center gap-2 border-t-2 border-destructive/40 font-semibold pulse-alert">
          <AlertTriangle className="w-4 h-4" />
          Attention : marge résiduelle inférieure à 20 % sur {criticalCount} scénario
          {criticalCount > 1 ? "s" : ""}.
        </div>
      )}
    </Card>
  );
}
