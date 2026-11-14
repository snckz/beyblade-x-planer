// Kalender-Export (.ics): iPhone, Android und PC übernehmen die Termine samt Erinnerung in ihren Kalender.

export interface CalItem {
  uid: string;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DD, inklusiv */
  endDate?: string;
  title: string;
  location?: string;
  description?: string;
  url?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n|\r/g, '\\n').replace(/([,;])/g, '\\$1');
const day = (d: string) => d.replace(/-/g, '');
const nextDay = (d: string) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

const enc = new TextEncoder();

/** Zeilen nach RFC 5545 auf 75 Bytes falten, ohne Zeichen (Umlaute, Emoji) zu zerschneiden. */
const fold = (line: string) => {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
};

/** Ganztägige Termine mit Erinnerung am Vortag um 9 Uhr (−15 h ab Mitternacht). */
export function buildIcs(items: CalItem[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//beyblade-x-planer//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const it of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.uid}@beyblade-x-planer`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(it.date)}`,
      `DTEND;VALUE=DATE:${day(nextDay(it.endDate ?? it.date))}`,
      `SUMMARY:${esc(it.title)}`,
      ...(it.location ? [`LOCATION:${esc(it.location)}`] : []),
      ...(it.description ? [`DESCRIPTION:${esc(it.description)}`] : []),
      ...(it.url ? [`URL:${it.url}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(it.title)}`,
      'TRIGGER:-PT15H',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Termine in den Kalender bringen.
 * iPhone/iPad: Die Datei direkt öffnen – Safari zeigt dann „Zum Kalender hinzufügen“ (ein Download-Link landet sonst nur in „Downloads“).
 * Andere Geräte: .ics herunterladen.
 */
export function downloadIcs(items: CalItem[], filename: string) {
  const blob = new Blob([buildIcs(items)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  if (isIos()) {
    window.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
