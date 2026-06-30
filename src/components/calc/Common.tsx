import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";

export function QuantitesRow({
  quantites,
  onChange,
}: {
  quantites: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">Quantités (jusqu'à 5 scénarios)</Label>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Input
            key={i}
            type="number"
            min={0}
            placeholder="—"
            value={quantites[i] ?? ""}
            onChange={(e) => {
              const next = [...quantites];
              const v = e.target.value === "" ? 0 : Number(e.target.value);
              next[i] = Number.isFinite(v) ? v : 0;
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export type SimpleLine = { libelle: string; prixUnitaire: number };
export type SimpleForfait = { libelle: string; montantGlobal: number };

export function LinesTable({
  title,
  lines,
  onChange,
  field,
}: {
  title: string;
  lines: any[];
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
          onClick={() => onChange([...lines, { libelle: "", [field]: 0 }])}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une ligne
        </Button>
      </div>
      <div className="border rounded-md divide-y">
        {lines.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Aucune ligne.</div>
        )}
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_36px] gap-2 px-2 py-1.5 items-center">
            <Input
              value={l.libelle}
              placeholder="Libellé"
              onChange={(e) => update(i, "libelle", e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              value={l[field] ?? ""}
              placeholder={field === "prixUnitaire" ? "Prix unitaire" : "Montant global"}
              onChange={(e) =>
                update(i, field, e.target.value === "" ? 0 : Number(e.target.value))
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
  );
}
