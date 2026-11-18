// Typen zu idRegister.js (gemeinsam für App und Datenpipeline)
import type { Blade, Database } from './types';
import type { UserState } from './storage';

export type IdKind = 'blades' | 'ratchets' | 'bits' | 'products';
type Section<V> = Record<IdKind, Record<string, V>>;

export interface IdRegister {
  aliases: Section<string>;
  retired: Section<string | string[] | null>;
  reassigned: Record<string, string>;
}

export const KINDS: IdKind[];
export const EMPTY_REGISTER: IdRegister;
export function norm(s: string): string;
export function wordKey(s: string): string;
export function normalizeRegister(raw: unknown): IdRegister;
export function resolveIds(register: unknown, kind: IdKind, id: string, exists: (id: string) => boolean): string[];
export function resolveId(register: unknown, kind: IdKind, id: string, exists: (id: string) => boolean): string | undefined;
export function validateRegister(register: unknown, db: Pick<Database, 'blades' | 'ratchets' | 'bits' | 'products'>): string[];
export function createBladeIndex(
  blades: Blade[],
  register: unknown,
  options?: { wordOrder?: boolean },
): { find: (...names: (string | undefined)[]) => Blade | undefined; ambiguous: (...names: (string | undefined)[]) => boolean; add: (blade: Blade) => void };
export function migrateUserState(state: UserState, register: unknown, db: Database): { state: UserState; changes: string[] };
