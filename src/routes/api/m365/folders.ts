import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createM365Folder, getM365Config, listM365Folders } from "@/lib/m365.server";
import { getIdentity } from "@/lib/session.server";

const createSchema = z.object({
  parentId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(120),
});

async function requireIdentity(request: Request) {
  const identity = await getIdentity(request);
  if (!identity) throw new Response("Session expirée", { status: 401 });
  return identity;
}

async function getFolders(request: Request) {
  await requireIdentity(request);
  const config = getM365Config();
  if (!config.configured) {
    return Response.json({ configured: false }, { status: 503 });
  }
  const parentId = new URL(request.url).searchParams.get("parentId");
  try {
    return Response.json({ configured: true, ...(await listM365Folders(parentId)) });
  } catch (error) {
    console.error("Lecture Microsoft 365 impossible", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Lecture Microsoft 365 impossible" },
      { status: 502 },
    );
  }
}

async function postFolder(request: Request) {
  await requireIdentity(request);
  try {
    const input = createSchema.parse(await request.json());
    return Response.json(await createM365Folder(input.parentId ?? null, input.name), {
      status: 201,
    });
  } catch (error) {
    console.error("Création du dossier Microsoft 365 impossible", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Création impossible" },
      { status: 400 },
    );
  }
}

export const Route = createFileRoute("/api/m365/folders")({
  server: {
    handlers: {
      GET: ({ request }) => getFolders(request),
      POST: ({ request }) => postFolder(request),
    },
  },
});
