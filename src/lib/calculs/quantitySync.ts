import type { LineItem, Outillage, Quantite, TransportPackaging } from "@/lib/calculs/types";
import {
  reshapePrixParQuantite,
  reshapeTransportParQuantite,
  reshapeMargeParQuantite,
  reshapeMargeParQuantiteConfirmed,
  reshapeQuantitesActives,
  normalizeTransportPackaging,
  normalizeOutillage,
} from "@/lib/calculs/types";

/**
 * Sync each line's `prixParQuantite` when the quantities array changes.
 * Handles: add-at-end, remove-at-index, and simple qty/margin edits.
 * Assumes QuantitesRow appends new quantities and filters by index on remove
 * (so unchanged entries keep the same object reference).
 */
export function syncLinesWithQuantites<T extends LineItem>(
  oldQ: Quantite[],
  newQ: Quantite[],
  lines: T[],
): T[] {
  if (newQ.length > oldQ.length) {
    // A newly added dossier quantity does not silently attach itself to lines
    // that already had an explicit selection. Legacy lines keep all selected.
    return lines.map((l) => {
      const quantitesActives = Array.isArray(l.quantitesActives)
        ? [...reshapeQuantitesActives(l, oldQ.length), false]
        : Array.from({ length: newQ.length }, () => true);
      return {
        ...l,
        prixParQuantite: reshapePrixParQuantite(l, newQ.length),
        transportParQuantite: reshapeTransportParQuantite(l, newQ.length),
        margeParQuantite: reshapeMargeParQuantite(l, newQ.length),
        margeParQuantiteConfirmed: reshapeMargeParQuantiteConfirmed(l, newQ.length),
        quantitesActives,
      };
    });
  }
  if (newQ.length < oldQ.length) {
    // Remove: find the first differing index by reference — that's the removed slot.
    let removed = oldQ.length - 1;
    for (let i = 0; i < newQ.length; i++) {
      if (oldQ[i] !== newQ[i]) {
        removed = i;
        break;
      }
    }
    return lines.map((l) => {
      const arr = reshapePrixParQuantite(l, oldQ.length);
      const transportArr = reshapeTransportParQuantite(l, oldQ.length);
      const margeArr = reshapeMargeParQuantite(l, oldQ.length);
      const margeConfirmedArr = reshapeMargeParQuantiteConfirmed(l, oldQ.length);
      const quantitesActives = reshapeQuantitesActives(l, oldQ.length);
      arr.splice(removed, 1);
      transportArr.splice(removed, 1);
      margeArr.splice(removed, 1);
      margeConfirmedArr.splice(removed, 1);
      quantitesActives.splice(removed, 1);
      return {
        ...l,
        prixParQuantite: arr,
        transportParQuantite: transportArr,
        margeParQuantite: margeArr,
        margeParQuantiteConfirmed: margeConfirmedArr,
        quantitesActives,
      };
    });
  }
  return lines;
}

/**
 * Resize the Transport/Packaging `montantsGlobaux` array to match a new
 * quantities layout while preserving values by column index.
 */
export function syncTransportWithQuantites(
  oldQ: Quantite[],
  newQ: Quantite[],
  tp: TransportPackaging | undefined,
): TransportPackaging {
  const normalized = normalizeTransportPackaging(tp, oldQ.length);
  const arr = [...normalized.montantsGlobaux];
  if (newQ.length > oldQ.length) {
    while (arr.length < newQ.length) arr.push(0);
  } else if (newQ.length < oldQ.length) {
    let removed = oldQ.length - 1;
    for (let i = 0; i < newQ.length; i++) {
      if (oldQ[i] !== newQ[i]) {
        removed = i;
        break;
      }
    }
    arr.splice(removed, 1);
  }
  arr.length = newQ.length;
  return { ...normalized, montantsGlobaux: arr };
}

/** Keep detailed tooling amounts aligned when quantity columns are added or removed. */
export function syncOutillageWithQuantites(
  oldQ: Quantite[],
  newQ: Quantite[],
  value: Outillage | undefined,
): Outillage {
  const normalized = normalizeOutillage(value, oldQ.length);
  const amounts = [...(normalized.montantsParQuantite ?? [])];
  if (newQ.length > oldQ.length) {
    while (amounts.length < newQ.length) amounts.push(0);
  } else if (newQ.length < oldQ.length) {
    let removed = oldQ.length - 1;
    for (let index = 0; index < newQ.length; index += 1) {
      if (oldQ[index] !== newQ[index]) {
        removed = index;
        break;
      }
    }
    amounts.splice(removed, 1);
  }
  amounts.length = newQ.length;
  return { ...normalized, montantsParQuantite: amounts };
}
