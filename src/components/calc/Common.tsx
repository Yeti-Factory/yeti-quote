import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import type { Quantite, LineItem, LineForfait, TransportPackaging } from "@/lib/calculs/types";
import { reshapePrixParQuantite } from "@/lib/calculs/types";

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
  defaultMargePct,
}: {
  title: string;
  lines: (LineItem | LineForfait)[];
  onChange: (lines: any[]) => void;
  field: "prixUnitaire" | "montantGlobal";
  defaultMargePct?: number;
}) {
  function update(i: number, key: string, value: any) {
    const next = lines.map((l, idx) => (idx === i ? { ...l, [key]: value } : l));
    onChange(next);
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-semibold">{title}</Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange([
              ...lines,
              { fournisseur: "", libelle: "", [field]: 0, margePct: defaultMargePct ?? null },
            ])
          }
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une ligne
        </Button>
      </div>
      <div className="border-2 rounded-md overflow-hidden calc-table">
        <div className="grid grid-cols-[160px_1fr_140px_120px_36px] gap-2 px-3 py-2 border-b-2 bg-secondary text-secondary-foreground text-[11px] uppercase font-semibold tracking-wider">
          <div>Fournisseur</div>
          <div>Libellé</div>
          <div className="text-right">
            {field === "prixUnitaire" ? "Prix unitaire" : "Montant global"}
          </div>
          <div className="text-right">Marge ligne %</div>
          <div />
        </div>
        {lines.length === 0 && (
          <div className="px-3 py-5 text-xs text-muted-foreground text-center bg-muted/30">
            Aucune ligne.
          </div>
        )}
        <div>
          {lines.map((l: any, i) => (
            <div
              key={i}
              className="calc-row grid grid-cols-[160px_1fr_140px_120px_36px] gap-2 px-3 py-2 items-center border-b last:border-b-0"
            >
              <Input
                value={l.fournisseur ?? ""}
                placeholder="Fournisseur"
                maxLength={20}
                onChange={(e) => update(i, "fournisseur", e.target.value)}
              />
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
                className="text-right tabular-nums"
                onChange={(e) =>
                  update(i, field, e.target.value === "" ? 0 : Number(e.target.value))
                }
              />
              <Input
                type="number"
                step="0.01"
                value={l.margePct ?? defaultMargePct ?? ""}
                placeholder="marge %"
                className="text-right tabular-nums"
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

/**
 * Price grid: one purchase-price cell per quantity column.
 * Backward compatible with lines that only have `prixUnitaire`.
 */
export function LinesGridTable({
  title,
  lines,
  onChange,
  quantites,
  defaultMargePct,
}: {
  title: string;
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  quantites: Quantite[];
  defaultMargePct?: number;
}) {
  const qCount = quantites.length;

  function ensureArr(l: LineItem): number[] {
    return reshapePrixParQuantite(l, qCount);
  }

  function update(i: number, patch: Partial<LineItem>) {
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function updatePrice(i: number, col: number, value: number) {
    const line = lines[i];
    const arr = ensureArr(line);
    arr[col] = value;
    update(i, { prixParQuantite: arr, prixUnitaire: arr[0] ?? 0 });
  }

  function addLine() {
    onChange([
      ...lines,
      {
        fournisseur: "",
        libelle: "",
        prixUnitaire: 0,
        prixParQuantite: Array.from({ length: qCount }, () => 0),
        margePct: defaultMargePct ?? null,
      },
    ]);
  }

  // Column widths
  const tmpl = `160px minmax(240px,1fr) ${Array.from({ length: qCount }, () => "110px").join(" ")} 110px 36px`;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-semibold">{title}</Label>
        <Button type="button" size="sm" variant="ghost" onClick={addLine}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une ligne
        </Button>
      </div>
      {qCount === 0 ? (
        <div className="border-2 rounded-md px-3 py-4 text-xs text-muted-foreground text-center bg-muted/30">
          Ajoutez au moins une quantité pour saisir les prix d’achat.
        </div>
      ) : (
        <div className="border-2 rounded-md overflow-hidden calc-table">
          <div className="overflow-x-auto">
            <div style={{ minWidth: `calc(${310 + qCount * 110 + 110 + 36}px)` }}>
              <div
                className="grid gap-2 px-3 py-2 border-b-2 bg-secondary text-secondary-foreground text-[11px] uppercase font-semibold tracking-wider"
                style={{ gridTemplateColumns: tmpl }}
              >
                <div>Fournisseur</div>
                <div>Libellé</div>
                {quantites.map((q, i) => (
                  <div key={i} className="text-right">
                    Achat qté {(Number(q.qty) || 0).toLocaleString("fr-FR")}
                  </div>
                ))}
                <div className="text-right">Marge ligne %</div>
                <div />
              </div>
              {lines.length === 0 && (
                <div className="px-3 py-5 text-xs text-muted-foreground text-center bg-muted/30">
                  Aucune ligne.
                </div>
              )}
              {lines.map((l, i) => {
                const arr = ensureArr(l);
                return (
                  <div
                    key={i}
                    className="calc-row grid gap-2 px-3 py-2 items-center border-b last:border-b-0"
                    style={{ gridTemplateColumns: tmpl }}
                  >
                    <Input
                      value={l.fournisseur ?? ""}
                      placeholder="Fournisseur"
                      maxLength={20}
                      onChange={(e) => update(i, { fournisseur: e.target.value })}
                    />
                    <Input
                      value={l.libelle}
                      placeholder="Libellé"
                      onChange={(e) => update(i, { libelle: e.target.value })}
                    />
                    {arr.map((v, col) => (
                      <Input
                        key={col}
                        type="number"
                        step="0.01"
                        value={v || ""}
                        placeholder="—"
                        className="text-right tabular-nums"
                        onChange={(e) =>
                          updatePrice(i, col, e.target.value === "" ? 0 : Number(e.target.value))
                        }
                      />
                    ))}
                    <Input
                      type="number"
                      step="0.01"
                      value={l.margePct ?? defaultMargePct ?? ""}
                      placeholder="marge %"
                      className="text-right tabular-nums"
                      onChange={(e) =>
                        update(i, {
                          margePct: e.target.value === "" ? null : Number(e.target.value),
                        })
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
                );
              })}
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Chaque quantité utilise son propre prix d’achat.
      </p>
    </div>
  );
}

/**
 * Transport / Packaging block: one global amount per quantity column.
 * Displays computed unit cost read-only. Optional margin (%) override.
 */
export function TransportPackagingBlock({
  quantites,
  value,
  onChange,
  defaultMargePct,
}: {
  quantites: Quantite[];
  value: TransportPackaging;
  onChange: (v: TransportPackaging) => void;
  defaultMargePct?: number;
}) {
  const qCount = quantites.length;
  const arr = Array.from({ length: qCount }, (_, i) => Number(value?.montantsGlobaux?.[i]) || 0);

  function updateMontant(i: number, montant: number) {
    const next = [...arr];
    next[i] = montant;
    onChange({ ...value, montantsGlobaux: next });
  }

  function fmtEuro(n: number) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div>
          <Label className="text-sm font-semibold">Transport / Packaging</Label>
          <p className="text-xs text-muted-foreground">
            Marge optionnelle — laissée vide, T/P est refacturé sans marge.
          </p>
        </div>
        <div className="w-48">
          <Input
            type="number"
            step="0.01"
            placeholder="Marge % (facultatif)"
            value={value?.margePct ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                montantsGlobaux: arr,
                margePct: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="text-right tabular-nums"
          />
          <p className="text-[10px] text-muted-foreground mt-1 text-right">
            {value?.margePct === null ||
            value?.margePct === undefined ||
            value?.margePct === (undefined as any)
              ? "Sans marge (au coût)"
              : `Marge ${Number(value.margePct)} %`}
            {defaultMargePct !== undefined ? ` · déf. ${defaultMargePct} %` : ""}
          </p>
        </div>
      </div>
      {qCount === 0 ? (
        <div className="border-2 rounded-md px-3 py-4 text-xs text-muted-foreground text-center bg-muted/30">
          Ajoutez au moins une quantité pour saisir le Transport / Packaging.
        </div>
      ) : (
        <div className="border-2 rounded-md overflow-hidden calc-table">
          <div className="grid grid-cols-[110px_1fr_1fr] gap-2 px-3 py-2 border-b-2 bg-secondary text-secondary-foreground text-[11px] uppercase font-semibold tracking-wider">
            <div>Quantité</div>
            <div className="text-right">Montant global (€)</div>
            <div className="text-right">Coût unitaire</div>
          </div>
          {quantites.map((q, i) => {
            const Q = Number(q.qty) || 0;
            const montant = arr[i] || 0;
            const unit = Q > 0 ? montant / Q : 0;
            return (
              <div
                key={i}
                className="calc-row grid grid-cols-[110px_1fr_1fr] gap-2 px-3 py-2 items-center border-b last:border-b-0"
              >
                <div className="text-sm tabular-nums">{Q ? Q.toLocaleString("fr-FR") : "—"}</div>
                <Input
                  type="number"
                  step="0.01"
                  value={montant || ""}
                  placeholder="0"
                  className="text-right tabular-nums"
                  onChange={(e) =>
                    updateMontant(i, e.target.value === "" ? 0 : Number(e.target.value))
                  }
                />
                <div className="text-right text-sm font-medium tabular-nums text-muted-foreground">
                  {Q > 0 ? fmtEuro(unit) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Le montant global est divisé automatiquement par la quantité et ajouté au prix de vente
        unitaire.
      </p>
    </div>
  );
}
