import { nightsBetween } from "./dates";

export type PriceInput = {
  costPerNight: number;
  markupPercent: number;
  cleaningFee: number;
};

export type PriceBreakdown = {
  nights: number;
  /** Selvkost for alle nettene. */
  cost: number;
  /** Eierens påslag. */
  markup: number;
  cleaning: number;
  total: number;
};

/**
 * Prisen er selvkost per døgn, pluss eierens påslag i prosent, pluss et fast
 * beløp for vask hvis eieren har valgt det. Alt i hele kroner.
 */
export function calculatePrice(
  cabin: PriceInput,
  startDate: string,
  endDate: string,
): PriceBreakdown {
  const nights = Math.max(0, nightsBetween(startDate, endDate));
  const cost = nights * cabin.costPerNight;
  const markup = Math.round((cost * cabin.markupPercent) / 100);
  const cleaning = nights > 0 ? cabin.cleaningFee : 0;
  return { nights, cost, markup, cleaning, total: cost + markup + cleaning };
}

export function formatKroner(amount: number): string {
  return `${new Intl.NumberFormat("nb-NO").format(amount)} kr`;
}
