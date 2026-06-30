export const fmtEUR = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
    : "—";

export const fmtPct = (n: number) =>
  Number.isFinite(n) ? (n * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " %" : "—";

export const fmtInt = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : "—";

export const fmtDate = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
