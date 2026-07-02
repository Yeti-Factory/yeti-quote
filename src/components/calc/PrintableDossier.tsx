import { fmtEUR, fmtPct, fmtDate } from "@/lib/format";
import {
  resolveMargePct,
  normalizeQuantites,
  getPrixAchat,
  type Quantite,
} from "@/lib/calculs/types";
import type { StandardInput } from "@/lib/calculs/standard";
import type { ContraInput } from "@/lib/calculs/contra";
import type { StandsInput } from "@/lib/calculs/stands";
import { calculerStandard } from "@/lib/calculs/standard";
import { calculerContra } from "@/lib/calculs/contra";
import { calculerStands } from "@/lib/calculs/stands";

type Meta = {
  reference: string;
  objet: string;
  clientName: string;
  userName?: string;
  type: string;
  onedriveNote?: string;
};

function TypeLabel(t: string) {
  if (t === "standard") return "Standard";
  if (t === "contra") return "Contra";
  if (t === "stands") return "Stand";
  if (t === "kits") return "Kits";
  return t;
}

function Header({ meta }: { meta: Meta }) {
  return (
    <div className="header">
      <div style={{ display: "flex", alignItems: "center", gap: "10pt" }}>
        <img src="/yeti-logo.png" alt="Yeti Factory" />
        <div>
          <h1>Feuille de calcul — {TypeLabel(meta.type)}</h1>
          <div style={{ fontSize: "9pt", color: "#333" }}>
            <strong>{meta.reference || "(sans réf.)"}</strong> · {meta.objet || "(sans objet)"}
          </div>
        </div>
      </div>
      <div className="meta">
        <div>
          <strong>Client :</strong> {meta.clientName || "—"}
        </div>
        <div>
          <strong>Imprimé le :</strong> {fmtDate(new Date())}
        </div>
        {meta.userName && (
          <div>
            <strong>Utilisateur :</strong> {meta.userName}
          </div>
        )}
      </div>
    </div>
  );
}

function QuantitesTable({
  quantites,
  defaultMargePct,
}: {
  quantites: Quantite[];
  defaultMargePct: number;
}) {
  const qs = normalizeQuantites(quantites);
  if (qs.length === 0) return null;
  return (
    <section>
      <h2>Quantités</h2>
      <table>
        <thead>
          <tr>
            <th>Colonne</th>
            <th className="num">Quantité</th>
            <th className="num">Marge quantité %</th>
          </tr>
        </thead>
        <tbody>
          {qs.map((q, i) => (
            <tr key={i}>
              <td>Col. {i + 1}</td>
              <td className="num">{q.qty.toLocaleString("fr-FR")}</td>
              <td className="num">
                {(q.margePct ?? defaultMargePct).toLocaleString("fr-FR", {
                  maximumFractionDigits: 2,
                })}{" "}
                %
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LineTable({
  title,
  lines,
  field,
  quantites,
  defaultMargePct,
}: {
  title: string;
  lines: any[];
  field: "prixUnitaire" | "montantGlobal";
  quantites: Quantite[];
  defaultMargePct: number;
}) {
  const qs = normalizeQuantites(quantites);
  return (
    <section>
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: "14%" }}>Fournisseur</th>
            <th>Libellé</th>
            <th className="num" style={{ width: "12%" }}>
              {field === "prixUnitaire" ? "Prix achat U." : "Montant global"}
            </th>
            <th className="num" style={{ width: "9%" }}>
              Marge %
            </th>
            {qs.map((q, i) => (
              <th key={i} className="num" style={{ width: "10%" }}>
                PV Qté {q.qty.toLocaleString("fr-FR")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td colSpan={4 + qs.length} style={{ textAlign: "center", color: "#666" }}>
                Aucune ligne.
              </td>
            </tr>
          )}
          {lines.map((l, i) => {
            const amount = Number(l[field]) || 0;
            return (
              <tr key={i}>
                <td>{l.fournisseur ?? ""}</td>
                <td>{l.libelle}</td>
                <td className="num">{fmtEUR(amount)}</td>
                <td className="num">
                  {(l.margePct ?? defaultMargePct).toLocaleString("fr-FR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  %
                </td>
                {qs.map((q, qi) => {
                  const m = resolveMargePct(l.margePct, q.margePct, defaultMargePct);
                  const base = field === "montantGlobal" && q.qty > 0 ? amount / q.qty : amount;
                  const pv = base * (1 + m / 100);
                  return (
                    <td key={qi} className="num">
                      {fmtEUR(pv)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ParamsBlock({ entries }: { entries: [string, string][] }) {
  return (
    <section>
      <h2>Paramètres utilisés</h2>
      <div className="params-grid">
        {entries.map(([k, v]) => (
          <div key={k}>
            <strong>{k} :</strong> {v}
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultsTable({ output }: { output: any }) {
  const scenarios = (output?.scenarios ?? []).filter((s: any) => s.quantite > 0);
  if (scenarios.length === 0) return null;
  const rows: { label: string; key: string; fmt?: (v: number) => string; strong?: boolean }[] = [
    { label: "Prix unitaire achat", key: "prixUnitaireAchat", fmt: fmtEUR },
    { label: "Prix vente net unitaire", key: "prixVenteNetUnit", fmt: fmtEUR },
    { label: "Achats total", key: "achatsTotal", fmt: fmtEUR },
    { label: "Frais fixes", key: "fraisFixes", fmt: fmtEUR },
    { label: "Comm. sourcing /u", key: "commissionSourcingUnit", fmt: fmtEUR },
    { label: "Comm. rapporteur /u", key: "commissionRapporteurUnit", fmt: fmtEUR },
    { label: "Comm. rapporteur total", key: "commissionRapporteurTotal", fmt: fmtEUR },
    { label: "Total prix unitaire", key: "totalPrixUnitaire", fmt: fmtEUR, strong: true },
    { label: "Total CA", key: "totalCA", fmt: fmtEUR, strong: true },
    { label: "Total dépenses", key: "totalDepenses", fmt: fmtEUR },
    { label: "Marge nette", key: "margeNet", fmt: fmtEUR, strong: true },
    { label: "% Marge", key: "margePct", fmt: fmtPct, strong: true },
  ];
  const critical = scenarios.filter((s: any) => s.margePct < 0.2).length;
  const alert = scenarios.some((s: any) => s.alerteMarge);
  return (
    <section>
      <h2 className="orange">Résultats</h2>
      <table>
        <thead>
          <tr>
            <th>Indicateur</th>
            {scenarios.map((s: any, i: number) => (
              <th key={i} className="num">
                Qté {s.quantite.toLocaleString("fr-FR")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.strong ? "total-row" : ""}>
              <td className={r.strong ? "strong" : ""}>{r.label}</td>
              {scenarios.map((s: any, i: number) => (
                <td
                  key={i}
                  className="num"
                  style={
                    (r.key === "margePct" || r.key === "margeNet") && s.margePct < 0.2
                      ? { color: "#b00", fontWeight: 700 }
                      : undefined
                  }
                >
                  {r.fmt ? r.fmt(s[r.key] as number) : (s[r.key] as number)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {critical > 0 && (
        <div className="alert">
          ⚠ Attention : marge résiduelle inférieure à 20 % sur {critical} scénario
          {critical > 1 ? "s" : ""}.
        </div>
      )}
      {alert && critical === 0 && (
        <div className="alert">Attention : marge insuffisante sur au moins un scénario.</div>
      )}
    </section>
  );
}

function StandardPrint({ payload }: { payload: StandardInput }) {
  const p = payload.params;
  const output = calculerStandard(payload);
  return (
    <>
      <QuantitesTable quantites={payload.quantites} defaultMargePct={p.coef_marge_pct} />
      <LineTable
        title="Achats principaux"
        lines={payload.achatsPrincipaux}
        field="prixUnitaire"
        quantites={payload.quantites}
        defaultMargePct={p.coef_marge_pct}
      />
      <LineTable
        title="Achats annexes (forfaits globaux)"
        lines={payload.achatsAnnexes}
        field="montantGlobal"
        quantites={payload.quantites}
        defaultMargePct={p.coef_marge_pct}
      />
      <ParamsBlock
        entries={[
          ["Marge par défaut", `${p.coef_marge_pct} %`],
          ["Frais fixes", `${p.frais_fixes_pct} %`],
          ["Commission sourcing", p.commission_sourcing ? "Oui" : "Non"],
          ["Sourcing %", `${p.commission_sourcing_pct} %`],
          ["Sourcing mini", fmtEUR(p.commission_sourcing_min_eur)],
          ["Comm. rapporteur", `${p.commission_rapporteur_pct} %`],
          ["Seuil alerte marge", `${p.seuil_alerte_marge_pct} %`],
        ]}
      />
      <ResultsTable output={output} />
    </>
  );
}

function ContraPrint({ payload }: { payload: ContraInput }) {
  const p = payload.params;
  const output = calculerContra(payload);
  return (
    <>
      <QuantitesTable quantites={payload.quantites} defaultMargePct={p.coef_contra_pct} />
      <LineTable
        title="Achats CHEZ CONTRA"
        lines={payload.achatsContra}
        field="prixUnitaire"
        quantites={payload.quantites}
        defaultMargePct={p.coef_contra_pct}
      />
      <LineTable
        title="Forfaits Contra"
        lines={payload.forfaitsContra}
        field="montantGlobal"
        quantites={payload.quantites}
        defaultMargePct={p.coef_contra_pct}
      />
      <LineTable
        title="Achats autres fournisseurs"
        lines={payload.achatsAutres}
        field="prixUnitaire"
        quantites={payload.quantites}
        defaultMargePct={p.coef_autres_pct}
      />
      <ParamsBlock
        entries={[
          ["Coef. Contra", `${p.coef_contra_pct} %`],
          ["Coef. Autres", `${p.coef_autres_pct} %`],
          ["Frais fixes", `${p.frais_fixes_pct} %`],
          ["Commission sourcing", p.commission_sourcing ? "Oui" : "Non"],
          ["Sourcing %", `${p.commission_sourcing_pct} %`],
          ["Sourcing mini", fmtEUR(p.commission_sourcing_min_eur)],
          ["Comm. rapporteur", `${p.commission_rapporteur_pct} %`],
        ]}
      />
      <ResultsTable output={output} />
    </>
  );
}

function StandsPrint({ payload }: { payload: StandsInput }) {
  const p = payload.params;
  const out = calculerStands(payload);
  return (
    <>
      {payload.sections.map((sec, si) => {
        const g = out.extra.groupes[si];
        return (
          <section key={si}>
            <h2>
              {sec.libelle} — Marge groupe{" "}
              {(g?.margePct ?? p.coef_marge_pct).toLocaleString("fr-FR", {
                maximumFractionDigits: 2,
              })}{" "}
              %
            </h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Fournisseur</th>
                  <th>Libellé</th>
                  <th className="num" style={{ width: "14%" }}>
                    Prix achat
                  </th>
                </tr>
              </thead>
              <tbody>
                {sec.lignes.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#666" }}>
                      Aucune ligne.
                    </td>
                  </tr>
                )}
                {sec.lignes.map((l, li) => (
                  <tr key={li}>
                    <td>{l.fournisseur ?? ""}</td>
                    <td>{l.libelle}</td>
                    <td className="num">{fmtEUR(Number(l.prixUnitaire) || 0)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={2}>Total groupe</td>
                  <td className="num">{fmtEUR(g?.achatTotal ?? 0)}</td>
                </tr>
                <tr className="total-row">
                  <td colSpan={2}>Prix de vente groupe</td>
                  <td className="num">{fmtEUR(g?.pvTotal ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}

      <section>
        <h2>Récapitulatif stand</h2>
        <table>
          <thead>
            <tr>
              <th>Groupe</th>
              <th className="num">Achat</th>
              <th className="num">Marge %</th>
              <th className="num">Prix de vente</th>
            </tr>
          </thead>
          <tbody>
            {out.extra.groupes.map((g, i) => (
              <tr key={i}>
                <td>{g.libelle}</td>
                <td className="num">{fmtEUR(g.achatTotal)}</td>
                <td className="num">{fmtPct(g.margePct / 100)}</td>
                <td className="num">{fmtEUR(g.pvTotal)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td>Total stand</td>
              <td className="num">{fmtEUR(out.extra.totalAchatGroupes)}</td>
              <td />
              <td className="num">{fmtEUR(out.extra.totalPvGroupes)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <ParamsBlock
        entries={[
          ["Marge par défaut", `${p.coef_marge_pct} %`],
          ["Marge créa supplémentaire", `${p.marge_crea_pct} %`],
          ["Frais fixes", `${p.frais_fixes_pct} %`],
          ["Comm. rapporteur", `${p.commission_rapporteur_pct} %`],
        ]}
      />

      <ResultsTable output={out} />
    </>
  );
}

export function PrintableDossier({
  meta,
  type,
  payload,
}: {
  meta: Meta;
  type: string;
  payload: any;
}) {
  return (
    <div className="print-only print-sheet">
      <Header meta={meta} />
      {type === "standard" && <StandardPrint payload={payload} />}
      {type === "contra" && <ContraPrint payload={payload} />}
      {type === "stands" && <StandsPrint payload={payload} />}
      {meta.onedriveNote && (
        <section>
          <h2>Note</h2>
          <div style={{ whiteSpace: "pre-wrap", fontSize: "9pt" }}>{meta.onedriveNote}</div>
        </section>
      )}
    </div>
  );
}
