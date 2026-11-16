// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Database, MetaFeed } from "../src/lib/types";
import { improveCombo } from "../src/lib/improve";
import { metaOpponents } from "../src/lib/battle";
import { bladeTraits } from "../src/lib/traits";

const db = JSON.parse(
  readFileSync(new URL("../public/data/db.json", import.meta.url), "utf8"),
) as Database;
const meta = JSON.parse(
  readFileSync(new URL("../public/data/meta.json", import.meta.url), "utf8"),
) as MetaFeed;
const { opponents } = metaOpponents(db, meta);
const all = {
  ratchets: db.ratchets.map((r) => r.id),
  bits: db.bits.map((b) => b.id),
};

describe("Kombo verbessern", () => {
  it("schlägt für eine schwache Kombo bessere Ratchet/Bit-Varianten vor", () => {
    const combo = {
      id: "",
      bladeId: "DranSword",
      ratchetId: "1-50",
      bitId: "N",
    };
    const list = improveCombo(db, combo, opponents, all, meta);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(3);
    for (const s of list) {
      expect(s.combo.bladeId).toBe("DranSword");
      expect(s.change).toMatch(/Ratchet|Bit/);
    }
    // keine zwei Vorschläge mit demselben Bit
    expect(new Set(list.map((s) => s.combo.bitId)).size).toBe(list.length);
  });
  it("behebt die Burst-Warnung bei wenigen Zacken", () => {
    const combo = {
      id: "",
      bladeId: "DranSword",
      ratchetId: "1-60",
      bitId: "F",
    };
    const list = improveCombo(db, combo, opponents, all, meta);
    expect(
      list.some((s) => s.fixes.some((f) => f.startsWith("Wenige Zacken"))),
    ).toBe(true);
  });
  it("nur mit eigenen Teilen: schlägt nichts vor, was man nicht hat", () => {
    const combo = {
      id: "",
      bladeId: "DranSword",
      ratchetId: "3-60",
      bitId: "F",
    };
    const list = improveCombo(
      db,
      combo,
      opponents,
      { ratchets: ["3-60", "4-60"], bits: ["F", "T"] },
      null,
    );
    for (const s of list) {
      expect(["3-60", "4-60"]).toContain(s.combo.ratchetId);
      expect(["F", "T"]).toContain(s.combo.bitId);
    }
  });
  it("meldet fehlende Teile, wenn eine Sammlung da ist", () => {
    const combo = {
      id: "",
      bladeId: "DranSword",
      ratchetId: "1-50",
      bitId: "N",
    };
    const list = improveCombo(
      db,
      combo,
      opponents,
      { ...all, owned: { ratchets: new Set(["1-50"]), bits: new Set(["N"]) } },
      meta,
    );
    expect(list.every((s) => s.missing.length > 0)).toBe(true);
  });
  it("integrierter Ratchet: tauscht nur das Bit", () => {
    const blade = db.blades.find((b) => b.integratedRatchet)!;
    const list = improveCombo(
      db,
      { id: "", bladeId: blade.id, bitId: "N" },
      opponents,
      all,
      meta,
    );
    for (const s of list) {
      expect(s.combo.ratchetId).toBeUndefined();
      expect(s.change).not.toMatch(/Ratchet/);
    }
  });
});

describe("Besonderheiten im Lexikon", () => {
  const fake: MetaFeed = {
    ...meta,
    decksTotal: 100,
    counts: { "GloryValkyrie||K": 30 },
  };
  it("zeigt Turnier-Anteil, integrierten Ratchet und Gimmick-Notiz", () => {
    const b = db.blades.find((x) => x.id === "GloryValkyrie")!;
    const t = bladeTraits(db, b, fake);
    expect(t[0]).toMatchObject({ title: "Top im Turnier", strong: true });
    expect(t.some((x) => x.title === "Ratchet integriert")).toBe(true);
  });
  it("erklärt CX-Bauweise statt „CX: Assist Blade (B).“ roh anzuzeigen", () => {
    const b = db.blades.find((x) => x.note?.startsWith("CX: Assist Blade"))!;
    const t = bladeTraits(db, b, null);
    const cx = t.find((x) => x.title.startsWith("Custom Line"))!;
    expect(cx.text).toMatch(/Assist Blade „/);
  });
  it("Linksdreher und Gewicht", () => {
    const b = db.blades.find((x) => x.spin === "left")!;
    const t = bladeTraits(db, b, null, 40);
    expect(t.map((x) => x.title)).toEqual(
      expect.arrayContaining(["Linksdreher", "Schwergewicht"]),
    );
  });
  it("Status-Notizen wie „Neuheit – …“ sind keine Besonderheit", () => {
    const b = {
      ...db.blades[0]!,
      note: "Neuheit – Typ und Drehrichtung noch nicht bestätigt.",
      spin: "right" as const,
      integratedRatchet: false,
      hasbroName: undefined,
    };
    expect(
      bladeTraits(db, b, null).find((x) => x.title === "Besonderheit"),
    ).toBeUndefined();
  });
});
