import type { BeyType, Combo, Database, ImageIndex } from './types';
import { analyze, resolveCombo, TYPE_LABEL } from './analysis';
import { displayName } from './names';

// Aufbau der Grafik (Hochformat 4:5). Die anderen Formate legen genau diesen Aufbau in ihre Leinwand.
const W = 1080;
const H = 1350;

export type DeckFormat = 'post' | 'square' | 'story';

/**
 * Seitenverhältnisse fürs Deck-Bild. Der Inhalt bleibt in allen gleich:
 * - post: 1080×1350 (4:5, Feed) – der ursprüngliche Aufbau, unverändert
 * - square: 1080×1080 (1:1) – Aufbau auf 80 % verkleinert, mittig
 * - story: 1080×1920 (9:16) – Aufbau senkrecht mittig, liegt damit im sicheren Bereich von Instagram & Co.
 */
export const DECK_FORMATS: Record<DeckFormat, { label: string; ratio: string; w: number; h: number; scale: number; dx: number; dy: number }> = {
  post: { label: 'Hochformat', ratio: '4:5', w: 1080, h: 1350, scale: 1, dx: 0, dy: 0 },
  square: { label: 'Quadrat', ratio: '1:1', w: 1080, h: 1080, scale: 0.8, dx: (1080 - W * 0.8) / 2, dy: 0 },
  story: { label: 'Story', ratio: '9:16', w: 1080, h: 1920, scale: 1, dx: 0, dy: (1920 - H) / 2 },
};
const TYPE_COLOR: Record<BeyType, string> = { attack: '#ff5a45', defense: '#4c8dff', stamina: '#36d37f', balance: '#f5c542' };
const FONT = "'Inter Tight', ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    const t = setTimeout(() => resolve(null), 4000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text auf Breite kürzen (mit „…“). */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Stilisierte Kreisel-Scheibe, wenn das Foto nicht geladen werden darf (fremder Server ohne CORS). */
function drawDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#1a1c24';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.92, -0.5, 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#0b0c10';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8e8ee';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Kleines Markenzeichen unten mittig: schräger roter Strich und „X-PLANER“ in gesperrten Großbuchstaben, halbtransparent. */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, baseline: number) {
  const text = 'X-PLANER';
  ctx.font = `700 22px ${FONT}`;
  const spacing = 5; // Sperrung in px je Zeichen
  const chars = [...text];
  const textW = chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
  const barW = 7;
  const gap = 14;
  let x = cx - (barW + gap + textW) / 2;
  // Schrägstrich
  ctx.save();
  ctx.translate(x + barW / 2, baseline - 8);
  ctx.transform(1, 0, -0.32, 1, 0, 0);
  roundRect(ctx, -barW / 2, -12, barW, 24, 2);
  ctx.fillStyle = 'rgba(243,38,69,.85)';
  ctx.fill();
  ctx.restore();
  // Schriftzug
  x += barW + gap;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,.42)';
  for (const c of chars) {
    ctx.fillText(c, x, baseline);
    x += ctx.measureText(c).width + spacing;
  }
}

/**
 * Zeichnet das Deck als teilbares Bild – Standard 1080×1350 (Instagram/WhatsApp-Hochformat), sonst im gewählten Format.
 * Fotos der Blades kommen vom Wiki – erlaubt der Server keine Weiterverwendung im Canvas, gibt es eine gezeichnete Scheibe.
 */
export async function renderDeckImage(db: Database, combos: Combo[], images: ImageIndex | null, title = 'Mein Deck', format: DeckFormat = 'post'): Promise<Blob> {
  const f = DECK_FORMATS[format];
  const canvas = document.createElement('canvas');
  canvas.width = f.w;
  canvas.height = f.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  try {
    await Promise.all([document.fonts?.load(`700 40px 'Inter Tight'`), document.fonts?.load(`italic 800 40px 'Inter Tight'`)]);
  } catch {
    /* System-Schrift reicht */
  }

  // Hintergrund über die ganze Leinwand des Formats
  const bg = ctx.createLinearGradient(0, 0, 0, f.h);
  bg.addColorStop(0, '#0c0e16');
  bg.addColorStop(1, '#05060a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, f.w, f.h);
  const glow = ctx.createRadialGradient(f.w / 2, f.h * 1.05, 50, f.w / 2, f.h * 1.05, f.w * 0.9);
  glow.addColorStop(0, 'rgba(255,59,48,.35)');
  glow.addColorStop(1, 'rgba(255,59,48,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, f.w, f.h);

  // Ab hier der Aufbau in Hochformat-Koordinaten (W×H), ins Format gelegt
  ctx.save();
  ctx.translate(f.dx, f.dy);
  ctx.scale(f.scale, f.scale);

  const logo = await loadImage(new URL('logo.webp', document.baseURI).href, false);
  if (logo) {
    const lw = 420;
    ctx.drawImage(logo, (W - lw) / 2, 64, lw, (lw * logo.naturalHeight) / logo.naturalWidth);
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `italic 800 84px ${FONT}`;
  ctx.fillText(fit(ctx, title, W - 160), W / 2, 228);

  const rows = combos.slice(0, 3);
  // Fotos parallel laden – nacheinander würde es offline bis zu 12 s dauern.
  const photos = await Promise.all(
    rows.map((c) => {
      const thumb = images?.blades[c.bladeId]?.thumb;
      return thumb ? loadImage(thumb, true) : Promise.resolve(null);
    }),
  );
  const top = 270;
  const cardH = 300;
  const gap = 28;
  for (let i = 0; i < rows.length; i++) {
    const r = resolveCombo(db, rows[i]!);
    const y = top + i * (cardH + gap);
    roundRect(ctx, 60, y, W - 120, cardH, 36);
    ctx.fillStyle = 'rgba(255,255,255,.055)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.1)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!r) continue;
    const a = analyze(r);
    const color = TYPE_COLOR[a.type];
    // Typ-Kante
    roundRect(ctx, 60, y, 10, cardH, 5);
    ctx.fillStyle = color;
    ctx.fill();

    // Bild
    const cx = 220;
    const cy = y + cardH / 2;
    const rad = 115;
    const img = photos[i] ?? null;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      const s = Math.max((rad * 2) / img.naturalWidth, (rad * 2) / img.naturalHeight);
      ctx.drawImage(img, cx - (img.naturalWidth * s) / 2, cy - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      ctx.restore();
    } else drawDisc(ctx, cx, cy, rad, color);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2);
    ctx.stroke();

    // Texte
    const x = 380;
    const maxW = W - 120 - (x - 60) - 40;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(`${i + 1}  ·  ${TYPE_LABEL[a.type].toUpperCase()}  ·  ${r.blade.spin === 'left' ? 'LINKS' : 'RECHTS'}`, x, y + 62);
    ctx.fillStyle = '#fff';
    ctx.font = `700 50px ${FONT}`;
    ctx.fillText(fit(ctx, displayName(r.blade), maxW), x, y + 120);
    ctx.fillStyle = color;
    ctx.font = `650 38px ${FONT}`;
    ctx.fillText(`${r.ratchet?.id ?? ''}${r.bit.id}`.trim() + (r.bit.name ? `  ${r.bit.name}` : ''), x, y + 168);

    // Werte-Balken
    const stats: [string, number][] = [
      ['ANG', a.profile.attack],
      ['AUS', a.profile.stamina],
      ['VER', a.profile.defense],
      ['BUR', a.profile.burstResistance],
    ];
    const bw = (maxW - 3 * 18) / 4;
    stats.forEach(([label, v], k) => {
      const bx = x + k * (bw + 18);
      const by = y + 208;
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(`${label} ${Math.round(v)}`, bx, by);
      roundRect(ctx, bx, by + 14, bw, 12, 6);
      ctx.fillStyle = 'rgba(255,255,255,.1)';
      ctx.fill();
      roundRect(ctx, bx, by + 14, Math.max(12, (bw * Math.min(100, v)) / 100), 12, 6);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }

  // Dezentes Erkennungszeichen statt Webadresse: roter Schrägstrich (wie vor den Fenstertiteln) + „X-PLANER“
  drawMark(ctx, W / 2, H - 58);
  ctx.restore();

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erstellt werden'))), 'image/png'));
}

/** Teilen ist direkt im Tipp möglich (Bild muss schon fertig sein – Safari verlangt das). */
export function deckFile(blob: Blob, format: DeckFormat = 'post'): File {
  return new File([blob], format === 'post' ? 'beyblade-deck.png' : `beyblade-deck-${format}.png`, { type: 'image/png' });
}

export function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  return !!nav.share && !!nav.canShare?.({ files: [file] });
}

/**
 * Bild über das Teilen-Menü des Systems weitergeben – NUR die Datei, ohne Titel oder Text.
 * iOS behandelt eine geteilte Datei mit Titel/Text wie ein Dokument (Dateikarte „beyblade-deck.png · PNG“) und
 * bietet „Bild sichern“ nicht an; nur mit Bilddatei zeigt es die Vorschau und „Bild sichern“ (→ Fotos).
 * Ergebnis: 'done' = Menü wurde mit einer Aktion beendet (welche, verrät das System nicht),
 * 'cancelled' = abgebrochen, 'failed' = Teilen nicht möglich.
 */
export async function shareImageFile(file: File): Promise<'done' | 'cancelled' | 'failed'> {
  try {
    await navigator.share({ files: [file] });
    return 'done';
  } catch (e) {
    return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** iPhone/iPad (auch iPadOS, das sich als Mac ausgibt) – dort führt „In Fotos sichern“ über das Teilen-Menü. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}
