/**
 * "3 days ago" のような相対時刻表示。i18n は将来 chrome.i18n に寄せる前提で
 * いまは英語固定。
 */
const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const formatRelative = (iso: string, now = Date.now()): string => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = t - now;
  const abs = Math.abs(diff);
  for (const { unit, ms } of UNITS) {
    if (abs >= ms) {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return rtf.format(Math.round(diff / 1000), "second");
};
