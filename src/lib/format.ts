// Human-friendly event times for the English UI: "today at 18:00",
// "tomorrow at 09:30", otherwise "Saturday 1 November at 18:00".
// 24-hour clock (en-GB), in the viewer's own time zone.
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const dayDiff = Math.round(
    (startOfDay(date) - startOfDay(now)) / (24 * 3600 * 1000),
  );
  if (dayDiff === 0) return `today at ${time}`;
  if (dayDiff === 1) return `tomorrow at ${time}`;

  const day = date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return `${day} at ${time}`;
}

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}
