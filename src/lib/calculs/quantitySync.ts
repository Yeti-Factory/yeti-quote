import type { LineItem, Quantite } from "@/lib/calculs/types";
import { reshapePrixParQuantite } from "@/lib/calculs/types";

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
    // Add: extend each line's array to the new length (fill with last known).
    return lines.map((l) => ({
      ...l,
      prixParQuantite: reshapePrixParQuantite(l, newQ.length),
    }));
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
      arr.splice(removed, 1);
      return { ...l, prixParQuantite: arr };
    });
  }
  return lines;
}
