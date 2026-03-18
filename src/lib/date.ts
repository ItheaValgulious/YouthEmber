export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toDateKey(input: Date | string | null | undefined): string {
  const date = input ? new Date(input) : new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateTime(input: Date | string | null | undefined): string {
  if (!input) {
    return '未设置';
  }

  const date = new Date(input);
  return `${toDateKey(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function addDays(input: Date | string, days: number): Date {
  const date = new Date(input);
  date.setDate(date.getDate() + days);
  return date;
}

export function startOfDay(input: Date | string): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(input: Date | string): Date {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function diffDays(start: Date | string, end: Date | string): number {
  const from = startOfDay(start).getTime();
  const to = startOfDay(end).getTime();
  return Math.floor((to - from) / 86_400_000);
}

export function toDateTimeLocalValue(input: Date | string | null | undefined): string {
  if (!input) {
    return '';
  }

  const date = new Date(input);
  return `${toDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

export function compareIsoDesc(a: string | null, b: string | null): number {
  return new Date(b ?? 0).getTime() - new Date(a ?? 0).getTime();
}

