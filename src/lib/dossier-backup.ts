import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type DossierRow = Database["public"]["Tables"]["dossiers"]["Row"];

export const DOSSIER_BACKUP_FORMAT = "yeti-quote-dossier";
export const DOSSIER_BACKUP_VERSION = 1;

const nullableString = z.string().nullable().optional();

export const dossierBackupSchema = z.object({
  format: z.literal(DOSSIER_BACKUP_FORMAT),
  version: z.literal(DOSSIER_BACKUP_VERSION),
  exportedAt: z.string(),
  app: z.literal("Yeti Quote").optional(),
  client: z.object({
    id: z.string().uuid(),
    entreprise: z.string().min(1),
    contact: nullableString,
    email: nullableString,
    telephone: nullableString,
    adresse: nullableString,
    notes: nullableString,
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  }),
  dossier: z.object({
    id: z.string().uuid(),
    reference: z.string(),
    objet: z.string().min(1),
    client_id: z.string().uuid(),
    contact: nullableString,
    email: nullableString,
    type: z.enum(["standard", "contra", "kits", "stands"]),
    statut: z.enum(["brouillon", "valide", "archive"]),
    onedrive_note: nullableString,
    payload: z.unknown().optional(),
    results: z.unknown().optional(),
    params: z.unknown().optional(),
    version: z.number().int().positive().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  }),
});

export type DossierBackup = z.infer<typeof dossierBackupSchema>;

export type DossierForExport = DossierRow & {
  clients?: Partial<ClientRow> | null;
};

type ExportMeta = {
  reference: string;
  objet: string;
  onedrive_note: string;
  statut: DossierRow["statut"];
};

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function createDossierBackup({
  dossier,
  meta,
  payload,
  results,
}: {
  dossier: DossierForExport;
  meta: ExportMeta;
  payload: unknown;
  results: unknown;
}): DossierBackup {
  const client = dossier.clients ?? {};

  return {
    format: DOSSIER_BACKUP_FORMAT,
    version: DOSSIER_BACKUP_VERSION,
    app: "Yeti Quote",
    exportedAt: new Date().toISOString(),
    client: {
      id: safeText(client.id, dossier.client_id),
      entreprise: safeText(client.entreprise, "Client sans nom"),
      contact: nullableText(client.contact),
      email: nullableText(client.email),
      telephone: nullableText(client.telephone),
      adresse: nullableText(client.adresse),
      notes: nullableText(client.notes),
      created_at: safeText(client.created_at, dossier.created_at),
      updated_at: safeText(client.updated_at, dossier.updated_at),
    },
    dossier: {
      id: dossier.id,
      reference: meta.reference.trim() || dossier.reference,
      objet: meta.objet.trim() || dossier.objet,
      client_id: dossier.client_id,
      contact: nullableText(dossier.contact),
      email: nullableText(dossier.email),
      type: dossier.type,
      statut: meta.statut,
      onedrive_note: nullableText(meta.onedrive_note),
      payload: payload ?? {},
      results: results ?? {},
      params: (payload as { params?: unknown } | null)?.params ?? dossier.params ?? {},
      version: dossier.version ?? 1,
      created_at: dossier.created_at,
      updated_at: dossier.updated_at,
    },
  };
}

export function parseDossierBackup(value: unknown): DossierBackup {
  return dossierBackupSchema.parse(value);
}

export function makeDossierBackupFilename(backup: DossierBackup) {
  const reference = backup.dossier.reference || "sans-reference";
  const client = backup.client.entreprise || "client";
  const object = backup.dossier.objet || "dossier";
  const raw = `${reference}-${client}-${object}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);

  return `yeti-dossier-${raw || "export"}.json`;
}

export function downloadDossierBackup(backup: DossierBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = makeDossierBackupFilename(backup);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
