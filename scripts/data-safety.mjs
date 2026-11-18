// Datenverlust-Schutz für alle Skripte, die public/data/db.json schreiben.
// - Vor dem Schreiben: Gültigkeit (validateDb, validateRetired) und Übergang gegen den bisherigen Stand
//   (validateTransition): Nichts Bestehendes verschwindet oder wird umbelegt, außer ausdrücklich im ID-Register
//   public/data/aliases.json (src/lib/idRegister.js).
// - Schreiben atomar (temporäre Datei + Umbenennen): Ein Abbruch mitten im Schreiben hinterlässt keine halbe Datei.
// Verdächtige Änderungen werfen DataSafetyError – das Skript bricht mit klarem Fehler ab, db.json bleibt unverändert.
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EMPTY_RETIRED, validateDb, validateRetired, validateTransition } from './validate-data.mjs';
import { normalizeRegister } from '../src/lib/idRegister.js';

export class DataSafetyError extends Error {
  constructor(errors) {
    super(`Datenverlust-Schutz: Update abgelehnt, db.json bleibt unverändert.\n- ${errors.join('\n- ')}\n` + 'Gewollte Löschungen, Umbenennungen oder Korrekturen im ID-Register public/data/aliases.json eintragen.');
    this.name = 'DataSafetyError';
    this.errors = errors;
  }
}

/** ID-Register lesen (fehlt die Datei: nichts eingetragen). Kaputtes JSON ist ein Fehler, kein „leer“. */
export function loadRegister(dataDir) {
  let text;
  try {
    text = readFileSync(new URL('aliases.json', dataDir), 'utf8');
  } catch {
    return normalizeRegister({});
  }
  return normalizeRegister(JSON.parse(text));
}
/** Frühere Bezeichnung (Phase 1): liefert dasselbe Register */
export const loadRetired = loadRegister;

/** Datei atomar ersetzen: erst vollständig daneben schreiben, dann in einem Schritt umbenennen. */
export function writeFileAtomic(url, text) {
  const path = url instanceof URL ? fileURLToPath(url) : url;
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  } catch (err) {
    // Keine halbe Datei zurücklassen (würde sonst mit `git add public/data` committet)
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** Prüft den Übergang prev → next; wirft DataSafetyError mit allen Befunden. */
export function assertSafeUpdate(prev, next, retired = EMPTY_RETIRED) {
  const errors = [...validateDb(next), ...validateRetired(retired, next), ...validateTransition(prev, next, retired)];
  if (errors.length) throw new DataSafetyError(errors);
}

/**
 * db.json nur schreiben, wenn der Übergang sicher ist. `prev` = Stand beim Lesen.
 * Gibt true zurück, wenn geschrieben wurde (false: keine Änderung).
 */
export function writeDbSafely(dataDir, prev, next) {
  if (JSON.stringify(prev) === JSON.stringify(next)) return false;
  assertSafeUpdate(prev, next, loadRetired(dataDir));
  writeFileAtomic(new URL('db.json', dataDir), JSON.stringify(next, null, 2) + '\n');
  return true;
}
