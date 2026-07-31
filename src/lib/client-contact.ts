export type ClientCivilite = "" | "monsieur" | "madame";

export function normalizeClientCivilite(value: unknown): ClientCivilite {
  return value === "monsieur" || value === "madame" ? value : "";
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function parseLegacyContact(contact: unknown) {
  const text = cleanText(contact);
  const monsieur = text.match(/^(?:m\.?|monsieur)\s+(.+)$/i);
  if (monsieur?.[1]) {
    return {
      civilite: "monsieur" as ClientCivilite,
      prenom: "",
      nom: monsieur[1].trim(),
      contact: text,
    };
  }

  const madame = text.match(/^(?:mme\.?|madame)\s+(.+)$/i);
  if (madame?.[1]) {
    return {
      civilite: "madame" as ClientCivilite,
      prenom: "",
      nom: madame[1].trim(),
      contact: text,
    };
  }

  const [prenom = "", ...rest] = text.split(/\s+/).filter(Boolean);
  return { civilite: "" as ClientCivilite, prenom, nom: rest.join(" "), contact: text };
}

export function parseClientContact(client: any) {
  const civilite = normalizeClientCivilite(client?.civilite);
  const prenom = cleanText(client?.prenom);
  const nom = cleanText(client?.nom);

  if (civilite || prenom || nom) {
    return { civilite, prenom, nom, contact: cleanText(client?.contact) };
  }

  return parseLegacyContact(client?.contact);
}

export function buildClientContactName(form: {
  civilite?: ClientCivilite;
  prenom: string;
  nom: string;
  contact: string;
}) {
  const civilite = normalizeClientCivilite(form.civilite);
  const nom = cleanText(form.nom);
  if (civilite === "monsieur" && nom) return `Monsieur ${nom}`;
  if (civilite === "madame" && nom) return `Madame ${nom}`;
  return [form.prenom.trim(), form.nom.trim()].filter(Boolean).join(" ") || form.contact.trim();
}

export function formatClientContact(client: any) {
  const { civilite, prenom, nom, contact } = parseClientContact(client);

  if (civilite === "monsieur" && nom) return `M. ${nom}`;
  if (civilite === "madame" && nom) return `Mme ${nom}`;
  return [prenom, nom].filter(Boolean).join(" ") || contact;
}

export function formatClientGreetingName(client: any, dossierContact?: unknown) {
  const parsed = parseClientContact({
    ...client,
    contact: cleanText(dossierContact) || client?.contact,
  });

  if (parsed.civilite === "monsieur" && parsed.nom) return `Monsieur ${parsed.nom}`;
  if (parsed.civilite === "madame" && parsed.nom) return `Madame ${parsed.nom}`;
  return parsed.prenom || parsed.contact;
}
