import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, entries: [] },
});

try {
  const { buildSageQuoteRows, makeSageQuoteCsv, prepareSageQuoteRows } =
    await server.ssrLoadModule("/src/lib/sage-export.ts");
  const params = {
    dossier: {
      type: "standard",
      reference: "DOS-42",
      objet: "REF-CLIENT",
      clients: { entreprise: "Client test", code_sage: "C42" },
    },
    meta: { reference: "DOS-42", objet: "REF-CLIENT" },
    payload: {
      offerCommonInfo: { title: "Titre de l'offre", text: "Informations complémentaires" },
      params: { coef_marge_pct: 0 },
      quantites: [{ margePct: 0 }],
      achatsPrincipaux: [
        { libelle: "Structure", descriptif: "Structure aluminium", prixParQuantite: [100] },
        { libelle: "Éclairage", prixParQuantite: [50] },
        { libelle: "Option écran", prixParQuantite: [25], isOption: true },
      ],
    },
    output: { scenarios: [{ quantite: 2, totalCA: 350 }] },
    scenarioIndex: 0,
  };

  const rows = buildSageQuoteRows(params);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.designation),
    ["Structure", "Éclairage", "Option écran"],
  );
  assert.equal(rows[2].option, "Oui");
  assert.equal(
    rows.reduce((sum, row) => sum + row.montantHT, 0),
    350,
  );

  const selectedMain = [rows[0].numeroLigne, rows[1].numeroLigne];
  const grouped = prepareSageQuoteRows({
    ...params,
    options: { selectedLineNumbers: selectedMain, lineMode: "main_and_options" },
  });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].designation, "REF-CLIENT");
  assert.equal(grouped[0].montantHT, 300);

  const withOption = prepareSageQuoteRows({
    ...params,
    options: {
      selectedLineNumbers: rows.map((row) => row.numeroLigne),
      lineMode: "main_and_options",
    },
  });
  assert.equal(withOption.length, 2);
  assert.equal(withOption[1].designation, "Options retenues");
  assert.equal(
    withOption.reduce((sum, row) => sum + row.montantHT, 0),
    350,
  );

  const csv = makeSageQuoteCsv({
    ...params,
    options: { selectedLineNumbers: selectedMain, lineMode: "single_total" },
  });
  const dataLines = csv.split("\r\n").filter(Boolean);
  assert.ok(dataLines.every((line) => line.split("\t").length === 16));
  assert.equal(dataLines.filter((line) => line.startsWith("L\t")).length, 2);
  const headerFields = dataLines[1].split("\t");
  assert.equal(headerFields[13], "REF-CLIENT");
  assert.equal(headerFields[14], "");
  assert.equal(headerFields[15], "Titre de l'offre");
  const articleFields = dataLines[2].split("\t");
  const commentFields = dataLines[3].split("\t");
  assert.equal(articleFields[8], "REF-CLIENT");
  assert.equal(articleFields[14], "");
  assert.equal(articleFields[15], "");
  assert.equal(commentFields[6], "ARTDIVERS");
  assert.equal(commentFields[7], "");
  assert.match(commentFields[8], /Structure : Structure aluminium/);
  assert.equal(commentFields[9], "");
  assert.equal(commentFields[14], "T");
  assert.equal(commentFields[15], "");
  assert.match(dataLines[2], /\t1\.000\t300\.00\t20\.00\t\t/);

  console.log("Sage selection export checks passed.");
} finally {
  await server.close();
}
