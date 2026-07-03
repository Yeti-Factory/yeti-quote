import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { LinesGridTable, QuantitesRow, TransportPackagingBlock } from "@/components/calc/Common";
import { SectionHeader } from "@/components/calc/SectionHeader";
import { Layers, ShoppingCart, Truck, Settings2 } from "lucide-react";
import type { StandardInput, StandardParams } from "@/lib/calculs/standard";
import type { Quantite, TransportPackaging } from "@/lib/calculs/types";
import { normalizeTransportPackaging } from "@/lib/calculs/types";
import { syncLinesWithQuantites, syncTransportWithQuantites } from "@/lib/calculs/quantitySync";

export function StandardForm({
  value,
  onChange,
}: {
  value: StandardInput;
  onChange: (v: StandardInput) => void;
}) {
  const tp = normalizeTransportPackaging(value.transportPackaging, value.quantites.length);
  function setParams(p: Partial<StandardParams>) {
    onChange({ ...value, params: { ...value.params, ...p } });
  }
  function handleQuantitesChange(newQ: Quantite[]) {
    onChange({
      ...value,
      quantites: newQ,
      achatsPrincipaux: syncLinesWithQuantites(value.quantites, newQ, value.achatsPrincipaux),
      transportPackaging: syncTransportWithQuantites(
        value.quantites,
        newQ,
        value.transportPackaging,
      ),
    });
  }
  function setTP(next: TransportPackaging) {
    onChange({ ...value, transportPackaging: next });
  }
  return (
    <div className="space-y-5">
      <Card className="p-4 calc-section emphasis">
        <SectionHeader title="Quantités" tone="orange" icon={<Layers className="w-3.5 h-3.5" />} />
        <QuantitesRow
          quantites={value.quantites}
          onChange={handleQuantitesChange}
          defaultMargePct={value.params.coef_marge_pct}
        />
      </Card>

      <Card className="p-4 calc-section space-y-5">
        <div>
          <SectionHeader
            title="Achats principaux"
            subtitle="grille de prix par quantité"
            tone="dark"
            icon={<ShoppingCart className="w-3.5 h-3.5" />}
          />
          <LinesGridTable
            title="Lignes"
            lines={value.achatsPrincipaux}
            onChange={(l) => onChange({ ...value, achatsPrincipaux: l })}
            quantites={value.quantites}
            defaultMargePct={value.params.coef_marge_pct}
          />
        </div>
        <div>
          <SectionHeader
            title="Transport / Packaging"
            subtitle="montant global par quantité, divisé automatiquement"
            tone="muted"
            icon={<Truck className="w-3.5 h-3.5" />}
          />
          <TransportPackagingBlock
            quantites={value.quantites}
            value={tp}
            onChange={setTP}
            defaultMargePct={value.params.coef_marge_pct}
          />
        </div>
      </Card>

      <Card className="p-4 calc-section">
        <SectionHeader
          title="Paramètres"
          tone="muted"
          icon={<Settings2 className="w-3.5 h-3.5" />}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Coefficient de marge (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.coef_marge_pct}
              onChange={(e) => setParams({ coef_marge_pct: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Frais fixes (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.frais_fixes_pct}
              onChange={(e) => setParams({ frais_fixes_pct: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <div>
              <div className="text-sm font-medium">Commission sourcing</div>
              <div className="text-xs text-muted-foreground">5 % achats, mini 200 €</div>
            </div>
            <Switch
              checked={value.params.commission_sourcing}
              onCheckedChange={(b) => setParams({ commission_sourcing: b })}
            />
          </div>
          <div>
            <Label>Commission rapporteur (% du PV)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.commission_rapporteur_pct}
              onChange={(e) => setParams({ commission_rapporteur_pct: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Comm. sourcing (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.commission_sourcing_pct}
              onChange={(e) => setParams({ commission_sourcing_pct: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Minimum comm. sourcing (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.commission_sourcing_min_eur}
              onChange={(e) => setParams({ commission_sourcing_min_eur: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Seuil alerte marge (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.seuil_alerte_marge_pct}
              onChange={(e) => setParams({ seuil_alerte_marge_pct: Number(e.target.value) })}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
