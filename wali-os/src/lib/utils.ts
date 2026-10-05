import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currencySymbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", AED: "AED ", SAR: "SAR ", CAD: "CA$", AUD: "A$" };

/**
 * Compact numbers formatted by hand: Node and browser ICU builds disagree on
 * Intl's compact notation (e.g. "$39.0K" vs "$39K"), which breaks hydration.
 */
function compact(value: number) {
  const abs = Math.abs(value);
  const [div, suffix] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "K"] : [1, ""];
  const n = Math.round((value / div) * 10) / 10;
  return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}${suffix}`;
}

export function formatCurrency(value: number, currency = "USD", isCompact = false) {
  if (isCompact) return `${value < 0 ? "-" : ""}${currencySymbols[currency] ?? `${currency} `}${compact(Math.abs(value))}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number, isCompact = false) {
  if (isCompact) return compact(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
