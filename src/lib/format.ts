const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

export function toPersianNumber(value: number | string): string {
  return String(value).replace(/\d/g, (d) => persianDigits[Number(d)]);
}

const dateFormatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDate = (ms: number) => dateFormatter.format(ms);
export const formatDateTime = (ms: number) => dateTimeFormatter.format(ms);

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return toPersianNumber(`${m}:${s.toString().padStart(2, '0')}`);
}
