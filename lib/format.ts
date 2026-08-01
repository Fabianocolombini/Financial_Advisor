import { APP_LOCALE } from "./locale";

const BRL = new Intl.NumberFormat(APP_LOCALE, {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(amount: number): string {
  return BRL.format(amount);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(APP_LOCALE);
}
