/**
 * Minimal iCalendar (RFC 5545) writer for interview events, so they can be added to
 * Google Calendar, Outlook or Apple Calendar.
 */
export interface CalendarEvent {
  uid: string;
  start: Date;
  durationMinutes: number;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  updatedAt?: Date;
  cancelled?: boolean;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Escapes text values: backslash, semicolon, comma and newlines. */
export const escapeIcsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 octets must be folded with CRLF + space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildCalendar(events: CalendarEvent[], calendarName = 'CareerOS interviews'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CareerOS//Interviews//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];
  const now = stamp(new Date());
  for (const e of events) {
    const end = new Date(e.start.getTime() + Math.max(15, e.durationMinutes) * 60_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@careeros`,
      `DTSTAMP:${now}`,
      `LAST-MODIFIED:${stamp(e.updatedAt ?? new Date())}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeIcsText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeIcsText(e.location)}`);
    if (e.url && /^https?:\/\//i.test(e.url)) lines.push(`URL:${e.url.replace(/[\r\n]/g, '')}`);
    lines.push(`STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`);
    // A reminder one hour before
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Interview in 1 hour', 'TRIGGER:-PT1H', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
