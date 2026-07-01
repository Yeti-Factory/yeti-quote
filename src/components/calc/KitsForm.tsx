import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { fmtEUR, fmtPct } from "@/lib/format";
import type { KitsInput, KitsParams, KitsOutput } from "@/lib/calculs/kits";

const MAX_VARIANTES = 5;

export function KitsForm({
  value,
  onChange,
  output,
}: {
  value: KitsInput;
  onChange: (v: KitsInput) => void;
  output: KitsOutput;
}) {
  function setParams(p: Partial<KitsParams>) {
    onChange({ ...value, params: { ...value.params, ...p } });
  }
  function addElement() {
    onChange({
      ...value,
      elements: [
        ...value.elements,
        { libelle: "", prixAchatUnit: 0, qtyParVariante: value.variantes.map(() => 0) },
      ],
    });
  }
  function addVariante() {
    if (value.variantes.length >= MAX_VARIANTES) return;
    onChange({
      ...value,
      variantes: [...value.variantes, { libelle: `V${value.variantes.length + 1}`, nbKits: 0 }],
      elements: value.elements.map((e) => ({ ...e, qtyParVariante: [...e.qtyParVariante, 0] })),
    });
  }
  function removeVariante(i: number) {
    onChange({
      ...value,
      variantes: value.variantes.filter((_, idx) => idx !== i),
      elements: value.elements.map((e) => ({
        ...e,
        qtyParVariante: e.qtyParVariante.filter((_, idx) => idx !== i),
      })),
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Marge résiduelle cible (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.marge_residuelle_cible_pct}
              onChange={(e) => setParams({ marge_residuelle_cible_pct: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground mt-1">PV unitaire = achat / (1 − marge).</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Label>Variantes (nombre de kits par variante)</Label>
          <Button
            size="sm"
            variant="ghost"
            onClick={addVariante}
            disabled={value.variantes.length >= MAX_VARIANTES}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une variante
          </Button>
        </div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${value.variantes.length}, minmax(0,1fr))` }}
        >
          {value.variantes.map((v, i) => (
            <div key={i} className="border rounded-md p-2 space-y-1.5">
              <div className="flex items-center gap-1">
                <Input
                  value={v.libelle}
                  className="h-8"
                  onChange={(e) => {
                    const next = [...value.variantes];
                    next[i] = { ...v, libelle: e.target.value };
                    onChange({ ...value, variantes: next });
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => removeVariante(i)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
              <Input
                type="number"
                min={0}
                placeholder="Nb kits"
                value={v.nbKits || ""}
                onChange={(e) => {
                  const next = [...value.variantes];
                  next[i] = { ...v, nbKits: Number(e.target.value) || 0 };
                  onChange({ ...value, variantes: next });
                }}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Label>Éléments du kit</Label>
          <Button size="sm" variant="ghost" onClick={addElement}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter un élément
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="text-left px-2 py-2 w-[28%]">Élément</th>
                <th className="text-right px-2 py-2 w-32">Achat unit.</th>
                {value.variantes.map((v, i) => (
                  <th key={i} className="text-right px-2 py-2">
                    {v.libelle}
                  </th>
                ))}
                <th className="text-right px-2 py-2 w-32">PV unit.</th>
                <th className="text-right px-2 py-2 w-32">Total PV</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {value.elements.map((el, i) => {
                const r = output.elementResults[i];
                return (
                  <tr key={i} className="border-b">
                    <td className="px-2 py-1">
                      <Input
                        value={el.libelle}
                        onChange={(e) => {
                          const next = [...value.elements];
                          next[i] = { ...el, libelle: e.target.value };
                          onChange({ ...value, elements: next });
                        }}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={el.prixAchatUnit || ""}
                        onChange={(e) => {
                          const next = [...value.elements];
                          next[i] = { ...el, prixAchatUnit: Number(e.target.value) || 0 };
                          onChange({ ...value, elements: next });
                        }}
                      />
                    </td>
                    {value.variantes.map((_, vi) => (
                      <td key={vi} className="px-2 py-1">
                        <Input
                          type="number"
                          min={0}
                          value={el.qtyParVariante[vi] || ""}
                          onChange={(e) => {
                            const next = [...value.elements];
                            const q = [...el.qtyParVariante];
                            q[vi] = Number(e.target.value) || 0;
                            next[i] = { ...el, qtyParVariante: q };
                            onChange({ ...value, elements: next });
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(r?.pvUnit ?? 0)}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-medium">
                      {fmtEUR(r?.totalPV ?? 0)}
                    </td>
                    <td className="px-2 py-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          onChange({
                            ...value,
                            elements: value.elements.filter((_, idx) => idx !== i),
                          })
                        }
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Total achat" value={fmtEUR(output.totalAchat)} />
          <Stat label="Total PV (HT)" value={fmtEUR(output.totalPV)} emphasize />
          <Stat label="Marge globale" value={fmtEUR(output.margeGlobale)} emphasize />
          <Stat label="% Marge" value={fmtPct(output.margePct)} />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg ${emphasize ? "font-semibold" : ""} tabular-nums`}>{value}</div>
    </div>
  );
}
