import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  LinesTable,
  LinesGridTable,
  QuantitesRow,
  TransportPackagingBlock,
} from "@/components/calc/Common";
import type { MargeGuard } from "@/components/calc/Common";
import { SectionHeader } from "@/components/calc/SectionHeader";
import { Layers, ShoppingCart, Package, Truck, Settings2 } from "lucide-react";
import type { ContraInput, ContraParams } from "@/lib/calculs/contra";
import { CONTRA_STANDARD_MARGE_PCT, effectiveContraCoefPct } from "@/lib/calculs/contra";
import type { Quantite, TransportPackaging } from "@/lib/calculs/types";
import { normalizeTransportPackaging } from "@/lib/calculs/types";
import { syncLinesWithQuantites, syncTransportWithQuantites } from "@/lib/calculs/quantitySync";

const GUARD: MargeGuard = { standardPct: CONTRA_STANDARD_MARGE_PCT };

export function ContraForm({
  value,
  onChange,
}: {
  value: ContraInput;
  onChange: (v: ContraInput) => void;
}) {
  const tp = normalizeTransportPackaging(value.transportPackaging, value.quantites.length);
  const coefEffectif = effectiveContraCoefPct(value.params);
  const [coefDraft, setCoefDraft] = useState<string>(String(coefEffectif));
  useEffect(() => {
    setCoefDraft(String(coefEffectif));
  }, [coefEffectif]);

  function setParams(p: Partial<ContraParams>) {
    onChange({ ...value, params: { ...value.params, ...p } });
  }
  function commitCoef() {
    const parsed = coefDraft.trim() === "" ? CONTRA_STANDARD_MARGE_PCT : Number(coefDraft);
    const next = Number.isFinite(parsed) ? parsed : CONTRA_STANDARD_MARGE_PCT;
    if (next === coefEffectif) {
      setCoefDraft(String(coefEffectif));
      return;
    }
    if (next === CONTRA_STANDARD_MARGE_PCT) {
      setParams({ coef_contra_pct: CONTRA_STANDARD_MARGE_PCT, coef_contra_confirmed: false });
      return;
    }
    const ok = window.confirm(
      `L'accord standard Contra/Yeti est de ${CONTRA_STANDARD_MARGE_PCT} %.\n` +
        `Confirmez-vous cette modification à ${next} % ?`,
    );
    if (ok) setParams({ coef_contra_pct: next, coef_contra_confirmed: true });
    else setCoefDraft(String(coefEffectif));
  }
  function handleQuantitesChange(newQ: Quantite[]) {
    onChange({
      ...value,
      quantites: newQ,
      achatsContra: syncLinesWithQuantites(value.quantites, newQ, value.achatsContra),
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
          margeGuard={GUARD}
        />
      </Card>


      <Card className="p-4 calc-section space-y-5">
        <div>
          <SectionHeader
            title="Achats chez Contra"
            subtitle="grille de prix par quantité"
            tone="dark"
            icon={<ShoppingCart className="w-3.5 h-3.5" />}
          />
          <LinesGridTable
            title="Lignes"
            lines={value.achatsContra}
            onChange={(l) => onChange({ ...value, achatsContra: l })}
            quantites={value.quantites}
            margeGuard={GUARD}
          />
        </div>
        <div>
          <SectionHeader
            title="Forfaits Contra"
            subtitle="divisés par la quantité"
            tone="muted"
            icon={<Package className="w-3.5 h-3.5" />}
          />
          <LinesTable
            title="Lignes"
            lines={value.forfaitsContra}
            onChange={(l) => onChange({ ...value, forfaitsContra: l })}
            field="montantGlobal"
            margeGuard={GUARD}
          />
        </div>
        <div>
          <SectionHeader
            title="Transport / Packaging"
            subtitle="montant global par quantité, divisé automatiquement"
            tone="accent"
            icon={<Truck className="w-3.5 h-3.5" />}
          />
          <TransportPackagingBlock
            quantites={value.quantites}
            value={tp}
            onChange={setTP}
            useDefaultMarginWhenEmpty
            margeGuard={GUARD}
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
            <Label>Coef. Contra (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.coef_contra_pct}
              onChange={(e) => setParams({ coef_contra_pct: Number(e.target.value) })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Markup Contra sur le Bon de commande <em>et</em> marge résiduelle cible Yeti.
            </p>
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
          <div>
            <Label>Comm. rapporteur (% du PV)</Label>
            <Input
              type="number"
              step="0.01"
              value={value.params.commission_rapporteur_pct}
              onChange={(e) => setParams({ commission_rapporteur_pct: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <div>
              <div className="text-sm font-medium">Commission sourcing</div>
              <div className="text-xs text-muted-foreground">5 % achats autres, mini 200 €</div>
            </div>
            <Switch
              checked={value.params.commission_sourcing}
              onCheckedChange={(b) => setParams({ commission_sourcing: b })}
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
        </div>
      </Card>
    </div>
  );
}
