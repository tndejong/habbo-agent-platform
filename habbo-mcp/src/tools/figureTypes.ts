import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { queryOne } from '../db.js';

export const BUILTIN_FIGURE_TYPES = {
  default: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91',
  citizen: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91.ha-1012-110.hr-828-61',
  agent:
    'hd-3095-12.ch-255-64.lg-3235-96.sh-295-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0.fa-1211-1408.cp-3310-0.cc-3007-0.ca-1809-0.wa-2007-0',
} as const;

const DEFAULT_FIGUREDATA_URL = 'https://habbo.com/gamedata/figuredata/0';
const FIGURE_TYPES_FILE =
  process.env.FIGURE_TYPES_FILE || path.join(os.homedir(), '.cursor', 'habbo-mcp-figure-types.json');
const CACHE_TTL_MS = 5 * 60 * 1000;

type Gender = 'M' | 'F';

interface FigureTypeStore {
  types: Record<string, { figure: string; gender: Gender; updated_at: string }>;
}

interface FigurePalette {
  id: number;
  colors: Array<{ id: number; selectable: boolean; club: boolean }>;
}

interface FigureSetType {
  type: string;
  paletteId: number;
  mandatoryM0: boolean;
  mandatoryF0: boolean;
  sets: Array<{ id: number; gender: string; selectable: boolean; club: boolean; colorable: boolean }>;
}

interface FigureCatalog {
  sourceUrl: string;
  palettes: Map<number, FigurePalette>;
  settypes: Map<string, FigureSetType>;
}

interface ValidationOutcome {
  is_valid: boolean;
  normalized_figure: string | null;
  source_url: string;
  adjustments: string[];
  errors: string[];
}

let cachedCatalog: { expiresAt: number; catalog: FigureCatalog } | null = null;

export async function resolveFigureByType(figureType: string): Promise<string | null> {
  const key = normalizeFigureTypeKey(figureType);
  if (key in BUILTIN_FIGURE_TYPES) {
    return BUILTIN_FIGURE_TYPES[key as keyof typeof BUILTIN_FIGURE_TYPES];
  }
  const store = await readFigureTypeStore();
  return store.types[key]?.figure ?? null;
}

export async function listFigureTypes(): Promise<
  Array<{ type: string; source: 'builtin' | 'custom'; gender: Gender; figure: string }>
> {
  const custom = await readFigureTypeStore();
  const builtins = Object.entries(BUILTIN_FIGURE_TYPES).map(([type, figure]) => ({
    type,
    source: 'builtin' as const,
    gender: 'M' as Gender,
    figure,
  }));
  const customs = Object.entries(custom.types).map(([type, entry]) => ({
    type,
    source: 'custom' as const,
    gender: entry.gender,
    figure: entry.figure,
  }));
  return [...builtins, ...customs].sort((a, b) => a.type.localeCompare(b.type));
}

export async function validateFigure(figure: string, gender: Gender = 'M'): Promise<ValidationOutcome> {
  const catalog = await getFigureCatalog();
  return validateAgainstCatalog(figure, gender, catalog);
}

export async function registerFigureType(params: {
  figure_type: string;
  figure: string;
  gender?: Gender;
  overwrite?: boolean;
}): Promise<{
  figure_type: string;
  gender: Gender;
  figure: string;
  is_valid_input: boolean;
  adjustments: string[];
}> {
  const key = normalizeFigureTypeKey(params.figure_type);
  if (key in BUILTIN_FIGURE_TYPES) {
    throw new Error(`figure_type "${key}" is reserved (builtin). Choose another key.`);
  }
  const gender = params.gender ?? 'M';
  const validation = await validateFigure(params.figure, gender);
  if (!validation.normalized_figure) {
    throw new Error(`Could not normalize figure: ${validation.errors.join('; ')}`);
  }

  const store = await readFigureTypeStore();
  if (!params.overwrite && store.types[key]) {
    throw new Error(`figure_type "${key}" already exists. Set overwrite=true to replace it.`);
  }
  store.types[key] = {
    figure: validation.normalized_figure,
    gender,
    updated_at: new Date().toISOString(),
  };
  await writeFigureTypeStore(store);

  return {
    figure_type: key,
    gender,
    figure: validation.normalized_figure,
    is_valid_input: validation.is_valid,
    adjustments: validation.adjustments,
  };
}

function normalizeFigureTypeKey(input: string): string {
  const key = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
  if (!key || key.length < 2 || key.length > 40) {
    throw new Error('figure_type must be 2-40 chars using letters, numbers, "-" or "_".');
  }
  return key;
}

async function readFigureTypeStore(): Promise<FigureTypeStore> {
  try {
    const raw = await fs.readFile(FIGURE_TYPES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as FigureTypeStore;
    return { types: parsed.types || {} };
  } catch {
    return { types: {} };
  }
}

async function writeFigureTypeStore(store: FigureTypeStore): Promise<void> {
  await fs.mkdir(path.dirname(FIGURE_TYPES_FILE), { recursive: true });
  await fs.writeFile(FIGURE_TYPES_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function getFigureCatalog(): Promise<FigureCatalog> {
  const now = Date.now();
  if (cachedCatalog && cachedCatalog.expiresAt > now) {
    return cachedCatalog.catalog;
  }
  const sourceUrl = await getFiguredataUrl();
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch figuredata.xml from ${sourceUrl} (${response.status})`);
  }
  const xml = await response.text();
  const catalog = parseFiguredataXml(xml, sourceUrl);
  cachedCatalog = { catalog, expiresAt: now + CACHE_TTL_MS };
  return catalog;
}

async function getFiguredataUrl(): Promise<string> {
  const setting = await queryOne<{ value: string }>(
    'SELECT value FROM emulator_settings WHERE `key` = ? LIMIT 1',
    ['gamedata.figuredata.url']
  );
  return setting?.value || process.env.FIGUREDATA_URL || DEFAULT_FIGUREDATA_URL;
}

function parseFiguredataXml(xml: string, sourceUrl: string): FigureCatalog {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const figuredata = doc.figuredata as Record<string, unknown> | undefined;
  if (!figuredata) {
    throw new Error('Invalid figuredata.xml: missing <figuredata> root');
  }

  const palettes = new Map<number, FigurePalette>();
  const colorsRoot = figuredata.colors as Record<string, unknown> | undefined;
  for (const palette of asArray<Record<string, unknown>>(colorsRoot?.palette)) {
    const paletteId = toInt(palette['@_id']);
    if (paletteId === null) continue;
    const colors = asArray<Record<string, unknown>>(palette.color)
      .map((color) => ({
        id: toInt(color['@_id']) ?? -1,
        selectable: truthy(color['@_selectable'], true),
        club: truthy(color['@_club'], false),
      }))
      .filter((c) => c.id >= 0);
    palettes.set(paletteId, { id: paletteId, colors });
  }

  const settypes = new Map<string, FigureSetType>();
  const setsRoot = figuredata.sets as Record<string, unknown> | undefined;
  for (const settype of asArray<Record<string, unknown>>(setsRoot?.settype)) {
    const type = String(settype['@_type'] ?? '').trim();
    const paletteId = toInt(settype['@_paletteid']);
    if (!type || paletteId === null) continue;
    const sets = asArray<Record<string, unknown>>(settype.set)
      .map((set) => ({
        id: toInt(set['@_id']) ?? -1,
        gender: String(set['@_gender'] ?? 'U').toUpperCase(),
        selectable: truthy(set['@_selectable'], true),
        club: truthy(set['@_club'], false),
        colorable: truthy(set['@_colorable'], true),
      }))
      .filter((s) => s.id >= 0)
      .sort((a, b) => a.id - b.id);
    settypes.set(type, {
      type,
      paletteId,
      mandatoryM0: truthy(settype['@_mand_m_0'], false),
      mandatoryF0: truthy(settype['@_mand_f_0'], false),
      sets,
    });
  }

  return { sourceUrl, palettes, settypes };
}

function validateAgainstCatalog(figure: string, gender: Gender, catalog: FigureCatalog): ValidationOutcome {
  const adjustments: string[] = [];
  const errors: string[] = [];
  const parts = new Map<string, string[]>();

  for (const chunk of figure.split('.')) {
    if (!chunk.trim()) continue;
    const bits = chunk.split('-');
    const type = bits[0];
    if (!type) continue;
    if (!catalog.settypes.has(type)) {
      adjustments.push(`Dropped unknown part "${type}"`);
      continue;
    }
    if (parts.has(type)) {
      adjustments.push(`Duplicate part "${type}" replaced by last occurrence`);
    }
    parts.set(type, bits);
  }

  const normalized: string[] = [];
  for (const [type, settype] of catalog.settypes.entries()) {
    const mandatory = gender === 'M' ? settype.mandatoryM0 : settype.mandatoryF0;
    const provided = parts.get(type);
    if (!provided && !mandatory) continue;

    const chosenSet = pickSet(settype, provided, gender);
    if (!chosenSet) {
      errors.push(`No usable set found for "${type}"`);
      continue;
    }

    const palette = catalog.palettes.get(settype.paletteId);
    const selectedColors = pickColors(palette, provided, chosenSet.colorable);

    if (provided) {
      const providedSetId = toInt(provided[1]);
      if (providedSetId !== chosenSet.id) {
        adjustments.push(`Adjusted "${type}" set id from "${provided[1] ?? ''}" to "${chosenSet.id}"`);
      }
    } else if (mandatory) {
      adjustments.push(`Added mandatory part "${type}"`);
    }

    normalized.push([type, String(chosenSet.id), ...selectedColors].join('-'));
  }

  if (normalized.length === 0) {
    errors.push('No valid figure parts remained after validation');
  }

  normalized.sort((a, b) => a.localeCompare(b));

  return {
    is_valid: adjustments.length === 0 && errors.length === 0,
    normalized_figure: errors.length > 0 ? null : normalized.join('.'),
    source_url: catalog.sourceUrl,
    adjustments,
    errors,
  };
}

function pickSet(
  settype: FigureSetType,
  provided: string[] | undefined,
  gender: Gender
): { id: number; gender: string; selectable: boolean; club: boolean; colorable: boolean } | null {
  const usable = settype.sets.filter(
    (set) => set.selectable && !set.club && (set.gender === 'U' || set.gender === gender)
  );
  if (usable.length === 0) return null;
  const providedSetId = toInt(provided?.[1]);
  if (providedSetId !== null) {
    const exact = usable.find((set) => set.id === providedSetId);
    if (exact) return exact;
  }
  return usable[0];
}

function pickColors(
  palette: FigurePalette | undefined,
  provided: string[] | undefined,
  colorable: boolean
): string[] {
  if (!colorable || !palette) return [];
  const usableColors = palette.colors.filter((color) => color.selectable && !color.club);
  if (usableColors.length === 0) return [];
  const first = usableColors[0].id;
  const primary = toInt(provided?.[2]);
  const secondary = toInt(provided?.[3]);
  const c1 = usableColors.some((c) => c.id === primary) ? primary : first;
  const c2 = secondary !== null && usableColors.some((c) => c.id === secondary) ? secondary : null;
  return c2 === null ? [String(c1)] : [String(c1), String(c2)];
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === undefined || value === null) return [];
  return [value as T];
}

function toInt(value: unknown): number | null {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

function truthy(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  const str = String(value).trim().toLowerCase();
  return str === '1' || str === 'true';
}
