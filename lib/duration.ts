/** Short plan length for tiles: 30 -> "30m", 180 -> "3h", 90 -> "1h 30m", 2880 -> "2d". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes >= 2880 && minutes % 1440 === 0) return `${minutes / 1440}d`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
