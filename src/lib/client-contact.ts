export type ClientCivilite = "" | "monsieur" | "madame";

export function normalizeClientCivilite(value: unknown): ClientCivilite {
  return value === "monsieur" || value === "madame" ? value : "";
}

export function buildClientContactName(form: { prenom: string; nom: string; contact: string }) {
  return [form.prenom.trim(), form.nom.trim()].filter(Boolean).join(" ") || form.contact.trim();
}

export function formatClientContact(client: any) {
  const civilite = normalizeClientCivilite(client?.civilite);
  const prenom = String(client?.prenom ?? "").trim();
  const nom = String(client?.nom ?? "").trim();
  const legacyContact = String(client?.contact ?? "").trim();

  if (civilite === "monsieur" && nom) return `M. ${nom}`;
  if (civilite === "madame" && nom) return `Mme ${nom}`;
  return [prenom, nom].filter(Boolean).join(" ") || legacyContact;
}
