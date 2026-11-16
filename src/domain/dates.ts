export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Start of the learning week. Weeks run Sunday–Saturday (Israeli school week). */
export function weekStart(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - c.getDay());
  return c;
}

export function isInWeekOf(iso: string, now: Date): boolean {
  const start = weekStart(now).getTime();
  const end = addDays(weekStart(now), 7).getTime();
  const t = new Date(iso).getTime();
  return t >= start && t < end;
}
