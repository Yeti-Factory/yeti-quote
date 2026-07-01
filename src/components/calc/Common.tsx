import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import type { Quantite, LineItem, LineForfait } from "@/lib/calculs/types";

/**
 * Dynamic quantity columns with a per-quantity margin (%).
 * No pre-filled default quantities.
 */
export function QuantitesRow({
  quantites,
  onChange,
  defaultMargePct,
}: {
  quantites: Quantite[];
  onChange: (v: Quantite[]) => void;
  defaultMargePct?: number;
}) {
  function add() {
    onChange([...quantites, { qty: 0, margePct: defaultMargePct ?? null }]);
  }
  function remove(i: number) {
    onChange(quantites.filter((_, idx) => idx !== i));
  }
  function updateQty(i: number, qty: number) {
    const next = [...quantites];
    next[i] = { ...next[i], qty };
    onChange(next);
  }
  function updateMarge(i: number, margePct: number | null) {
    const next = [...quantites];
    next[i] = { ...next[i], margePct };
    onChange(next);
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>Colonnes de quantité</Label>
        <Button type="button" size="sm" variant="ghost" onClick={add}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une quantité
        </Button>
      </div>
      {quantites.length === 0 ? (
        <div className="border rounded-md px-3 py-4 text-xs text-muted-foreground text-center">
          Aucune quantité. Cliquez sur « Ajouter une quantité ».
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {quantites.map((q, i) => (
            <div key={i} className="border rounded-md p-2 space-y-1.5 w-40">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase text-muted-foreground">Col. {i + 1}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(i)}>
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
              <Input
                type="number"
                min={0}
                placeholder="Quantité"
                value={q.qty || ""}
                onChange={(e) => updateQty(i, e.target.value === "" ? 0 : Number(e.target.value))}
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Marge %"
                value={q.margePct ?? defaultMargePct ?? ""}
                onChange={(e) =>
                  updateMarge(i, e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        La marge par quantité s’applique aux lignes qui n’ont pas de marge propre.
      </p>
    </div>
  );
}

/**
 * Lines table with optional per-line margin (%).
 * Backward-compatible with rows that don't have `margePct`.
 */
export function LinesTable({
  title,
  lines,
  onChange,
  field,
}: {
  title: string;
  lines: (LineItem | LineForfait)[];
  onChange: (lines: any[]) => void;
  field: "prixUnitaire" | "montantGlobal";
}) {
  function update(i: number, key: string, value: any) {
    const next = lines.map((l, idx) => (idx === i ? { ...l, [key]: value } : l));
    onChange(next);
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>{title}</Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange([...lines, { libelle: "", [field]: 0, margePct: null }])}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une ligne
        </Button>
      </div>
      <div className="border rounded-md">
        <div className="grid grid-cols-[1fr_140px_120px_36px] gap-2 px-2 py-1.5 border-b bg-muted/40 text-xs uppercase text-muted-foreground">
          <div>Libellé</div>
          <div className="text-right">
            {field === "prixUnitaire" ? "Prix unitaire" : "Montant global"}
          </div>
          <div className="text-right">Marge ligne %</div>
          <div />
        </div>
        {lines.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Aucune ligne.</div>
        )}
        <div className="divide-y">
          {lines.map((l: any, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_140px_120px_36px] gap-2 px-2 py-1.5 items-center"
            >
              <Input
                value={l.libelle}
                placeholder="Libellé"
                onChange={(e) => update(i, "libelle", e.target.value)}
              />
              <Input
                type="number"
                step="0.01"
                value={l[field] ?? ""}
                placeholder="—"
                onChange={(e) =>
                  update(i, field, e.target.value === "" ? 0 : Number(e.target.value))
                }
              />
              <Input
                type="number"
                step="0.01"
                value={l.margePct ?? ""}
                placeholder="défaut"
                onChange={(e) =>
                  update(i, "margePct", e.target.value === "" ? null : Number(e.target.value))
                }
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
