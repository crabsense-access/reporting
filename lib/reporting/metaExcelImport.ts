// Fuente "Excel" de Meta Ads: para clientes cuya cuenta publicitaria no podemos leer por la API
// (ej. Perrazo), el admin sube el export de Meta Ads Manager / Meta Ads Reporting de un mes y acá
// se convierte en el MISMO shape que arma fetchRealInvestmentCalendarData con la Marketing API
// (RealInvestmentCalendarData). Así el Calendario de inversión, el Resumen general y el resto del
// reporte se ven exactamente igual que para un cliente conectado por API, sin tocar los bloques.
//
// Qué espera el export (es el que baja Meta con "Exportar → Datos sin formato" o el informe
// programado, que trae las hojas "Formatted Report" y "Raw Data Report"):
// - Una fila de encabezados con al menos Nombre de la campaña, Día, Monto gastado (XXX) y
//   Resultados (en español o en inglés). Se usa la hoja "Raw Data Report" si existe (trae los
//   nombres completos en cada fila); si no, la primera hoja que tenga esos encabezados.
// - Desglose por Día (obligatorio). Edad y Sexo son opcionales: con ellos se arman "Quién responde
//   a los anuncios" y "Porcentaje de visualización".
// - Filas de totales con "All" (las que agrega Meta en los informes jerárquicos) y filas de nivel
//   campaign/adset/ad ("Nivel de la entrega"): se usan sólo para el estado, el tipo de resultado y
//   el alcance de cada campaña; los números salen siempre de las filas de detalle, igual que con
//   la API, así todo reconcilia.
//
// Lo que un export de este tipo NO trae (y por eso esos bloques no se muestran en el reporte):
// ubicación de los anuncios (placements), región y franja horaria — Meta no deja combinarlos con
// Edad/Sexo en el mismo export.

import ExcelJS from "exceljs";

import { LEAD_TYPE_LABEL, LEAD_TYPES, type LeadType } from "@/lib/reporting/mockInvestmentCalendar";
import type {
  AudienceSegmentTotals,
  CampaignRankingEntry,
  DailyRealTotals,
  MetaCampaignStatus,
  RealInvestmentCalendarData,
  VideoRetentionByAge,
} from "@/lib/reporting/metaInvestmentData";

export class MetaExcelImportError extends Error {}

/** Resultado de leer un export: un mes (yyyy-MM) y sus datos ya en el shape del Calendario. */
export interface ParsedMetaExcel {
  month: string;
  data: RealInvestmentCalendarData;
  /** Resumen para mostrar en el Admin después de subir el archivo. */
  summary: { spend: number; currency: string; days: number; campaigns: number; ads: number; hasAudience: boolean; hasVideo: boolean };
}

// ─── Columnas ────────────────────────────────────────────────────────────────────────────────

type ColumnKey =
  | "campaignName" | "adsetName" | "adName" | "campaignId" | "adsetId" | "adId"
  | "age" | "gender" | "day" | "status" | "level"
  | "reach" | "impressions" | "resultType" | "results" | "spend" | "clicksAll" | "linkClicks" | "interactions"
  | "videoPlays" | "p25" | "p50" | "p75" | "p95" | "p100";

/** Encabezados aceptados para cada columna (normalizados: minúsculas, sin acentos). */
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  campaignName: ["nombre de la campana", "campaign name"],
  adsetName: ["nombre del conjunto de anuncios", "ad set name"],
  adName: ["nombre del anuncio", "ad name"],
  campaignId: ["identificador de la campana", "campaign id"],
  adsetId: ["identificador del conjunto de anuncios", "ad set id"],
  adId: ["identificador del anuncio", "ad id"],
  age: ["edad", "age"],
  gender: ["sexo", "gender"],
  day: ["dia", "day"],
  status: ["estado de la entrega", "delivery status"],
  level: ["nivel de la entrega", "delivery level"],
  reach: ["alcance", "reach"],
  impressions: ["impresiones", "impressions"],
  resultType: ["tipo de resultado", "result type", "result indicator"],
  results: ["resultados", "results"],
  spend: [], // "Monto gastado (MXN)" / "Importe gastado (ARS)" / "Amount spent (USD)" — ver findSpendColumn.
  clicksAll: ["clics (todos)", "clicks (all)"],
  linkClicks: ["clics en el enlace", "link clicks"],
  interactions: ["interacciones con la publicacion", "post engagements", "post engagement"],
  videoPlays: ["reproducciones de video", "video plays"],
  p25: ["reproducciones de video hasta el 25%", "video plays at 25%"],
  p50: ["reproducciones de video hasta el 50%", "video plays at 50%"],
  p75: ["reproducciones de video hasta el 75%", "video plays at 75%"],
  p95: ["reproducciones de video hasta el 95%", "video plays at 95%"],
  p100: ["reproducciones de video hasta el 100%", "video plays at 100%"],
};

const SPEND_PREFIXES = ["monto gastado", "importe gastado", "amount spent"];

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type Cell = string | number | null;

/** Valor "plano" de una celda de exceljs (fórmulas, texto enriquecido, fechas, hipervínculos). */
function cellValue(raw: ExcelJS.CellValue): Cell {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return raw;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "object") {
    if ("result" in raw) return cellValue((raw as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in raw) return (raw as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in raw) return String((raw as ExcelJS.CellHyperlinkValue).text);
    if ("error" in raw) return null;
  }
  return String(raw);
}

interface Header {
  rowNumber: number;
  columns: Partial<Record<ColumnKey, number>>;
  currency: string;
}

function findHeader(sheet: ExcelJS.Worksheet): Header | null {
  const maxScan = Math.min(sheet.rowCount, 30);
  for (let r = 1; r <= maxScan; r += 1) {
    const row = sheet.getRow(r);
    const columns: Partial<Record<ColumnKey, number>> = {};
    let currency = "";
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellValue(cell.value);
      if (typeof text !== "string") return;
      const header = normalizeHeader(text);
      for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as [ColumnKey, string[]][]) {
        if (columns[key] === undefined && aliases.includes(header)) columns[key] = colNumber;
      }
      if (columns.spend === undefined && SPEND_PREFIXES.some((p) => header.startsWith(p))) {
        columns.spend = colNumber;
        currency = text.match(/\(([A-Za-z]{3})\)/)?.[1]?.toUpperCase() ?? "";
      }
    });
    if (columns.campaignName !== undefined && columns.spend !== undefined) return { rowNumber: r, columns, currency };
  }
  return null;
}

// ─── Filas ───────────────────────────────────────────────────────────────────────────────────

interface Row {
  campaignId: string;
  campaignName: string;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
  /** null = total de todos los valores ("All") o columna ausente. */
  age: string | null;
  gender: string | null;
  day: string | null;
  status: string | null;
  level: string | null;
  resultType: string | null;
  reach: number;
  impressions: number;
  results: number;
  spend: number;
  clicksAll: number;
  linkClicks: number;
  interactions: number;
  videoPlays: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
}

function isAll(value: Cell): boolean {
  return value === null || (typeof value === "string" && ["all", "todos", "todas", ""].includes(value.trim().toLowerCase()));
}

function text(value: Cell): string | null {
  if (isAll(value)) return null;
  return String(value).trim();
}

function num(value: Cell): number {
  if (value === null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** "2026-08-01", "2026-08-01T…", 46235 (serial de Excel) → "2026-08-01". */
function toIsoDay(value: Cell): string | null {
  if (isAll(value)) return null;
  if (typeof value === "number") {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const dmy = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return null;
}

function readRows(sheet: ExcelJS.Worksheet, header: Header): Row[] {
  const { columns } = header;
  const get = (row: ExcelJS.Row, key: ColumnKey): Cell => {
    const col = columns[key];
    return col === undefined ? null : cellValue(row.getCell(col).value);
  };
  const rows: Row[] = [];
  for (let r = header.rowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const campaignName = text(get(row, "campaignName"));
    if (!campaignName) continue;
    const campaignId = text(get(row, "campaignId")) ?? campaignName;
    const adsetName = text(get(row, "adsetName"));
    const adName = text(get(row, "adName"));
    rows.push({
      campaignId,
      campaignName,
      adsetId: text(get(row, "adsetId")) ?? (adsetName ? `${campaignId}::${adsetName}` : null),
      adsetName,
      adId: text(get(row, "adId")) ?? (adName ? `${campaignId}::${adsetName ?? ""}::${adName}` : null),
      adName,
      age: text(get(row, "age")),
      gender: text(get(row, "gender")),
      day: toIsoDay(get(row, "day")),
      status: text(get(row, "status")),
      level: text(get(row, "level"))?.toLowerCase() ?? null,
      resultType: text(get(row, "resultType")),
      reach: num(get(row, "reach")),
      impressions: num(get(row, "impressions")),
      results: num(get(row, "results")),
      spend: num(get(row, "spend")),
      clicksAll: num(get(row, "clicksAll")),
      linkClicks: num(get(row, "linkClicks")),
      interactions: num(get(row, "interactions")),
      videoPlays: num(get(row, "videoPlays")),
      p25: num(get(row, "p25")),
      p50: num(get(row, "p50")),
      p75: num(get(row, "p75")),
      p95: num(get(row, "p95")),
      p100: num(get(row, "p100")),
    });
  }
  return rows;
}

/**
 * Filas de detalle con exactamente los desgloses pedidos (true = con valor, false = "All"). Se
 * prueban las variantes en orden y se usa la primera que tenga filas: el total por Día solo si el
 * export lo trae; si no, el desglose más fino (Día × Edad × Sexo), que sumado da lo mismo.
 */
function pickRows(detail: Row[], variants: { day: boolean; age: boolean; gender: boolean }[]): Row[] {
  for (const v of variants) {
    const rows = detail.filter((r) => (r.day !== null) === v.day && (r.age !== null) === v.age && (r.gender !== null) === v.gender);
    if (rows.length > 0) return rows;
  }
  return [];
}

const GENDER_LABEL: Record<string, "mujeres" | "hombres"> = { female: "mujeres", male: "hombres", mujer: "mujeres", hombre: "hombres", mujeres: "mujeres", hombres: "hombres" };

function campaignStatus(raw: string | null): MetaCampaignStatus | null {
  switch (raw?.toLowerCase()) {
    case "active":
    case "activa":
      return "activa";
    case "inactive":
    case "paused":
    case "campaign_paused":
    case "adset_paused":
    case "pausada":
      return "pausada";
    case "archived":
    case "deleted":
    case "archivada":
      return "archivada";
    default:
      return null; // ej. "not_delivering": Meta no dice si se pausó o terminó, mejor no mostrar estado.
  }
}

function mostFrequent(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
  return best;
}

// ─── Conversión ──────────────────────────────────────────────────────────────────────────────

export async function parseMetaExcel(buffer: ArrayBuffer): Promise<ParsedMetaExcel> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new MetaExcelImportError("No se pudo leer el archivo. Subí el export de Meta Ads en formato .xlsx.");
  }

  const sheets = [...workbook.worksheets].sort((a, b) => Number(/raw data/i.test(b.name)) - Number(/raw data/i.test(a.name)));
  let found: { sheet: ExcelJS.Worksheet; header: Header } | null = null;
  for (const sheet of sheets) {
    const header = findHeader(sheet);
    if (header) {
      found = { sheet, header };
      break;
    }
  }
  if (!found) {
    throw new MetaExcelImportError(
      "No encontré las columnas del export de Meta Ads (al menos \"Nombre de la campaña\" y \"Monto gastado\")."
    );
  }
  if (found.header.columns.day === undefined) {
    throw new MetaExcelImportError("El export tiene que estar desglosado por Día (agregá el desglose \"Día\" en Meta).");
  }

  const rows = readRows(found.sheet, found.header);
  // Filas de totales por nivel (campaign/adset/ad) vs. filas de detalle. Un export plano (sin
  // jerarquía) no tiene "Nivel de la entrega": todas sus filas son de detalle.
  const levelRows = rows.filter((r) => r.level !== null);
  const detail = rows.filter((r) => r.level === null && (r.adId !== null || found.header.columns.adName === undefined));

  const dailyRows = pickRows(detail, [
    { day: true, age: false, gender: false },
    { day: true, age: true, gender: true },
    { day: true, age: true, gender: false },
    { day: true, age: false, gender: true },
  ]);
  if (dailyRows.length === 0) throw new MetaExcelImportError("El export no tiene filas con datos por día.");

  const months = new Set(dailyRows.map((r) => r.day!.slice(0, 7)));
  if (months.size > 1) {
    throw new MetaExcelImportError(
      `El export abarca más de un mes (${[...months].sort().join(", ")}). Exportá un archivo por mes.`
    );
  }
  const month = [...months][0]!;

  // ── Tipo de resultado de cada conjunto de anuncios (igual que con la API: el gasto de un conjunto
  //    se imputa entero al tipo de Resultado por el que optimiza, tenga o no resultados ese día).
  const campaignType = new Map<string, string>();
  const adsetType = new Map<string, string>();
  const campaignStatusById = new Map<string, MetaCampaignStatus | null>();
  const campaignReach = new Map<string, number>();
  for (const r of levelRows) {
    if (r.level === "campaign") {
      if (r.resultType) campaignType.set(r.campaignId, r.resultType);
      campaignStatusById.set(r.campaignId, campaignStatus(r.status));
      campaignReach.set(r.campaignId, r.reach);
    } else if (r.level === "adset" && r.adsetId && r.resultType) {
      adsetType.set(r.adsetId, r.resultType);
    }
  }
  for (const id of new Set(detail.map((r) => r.campaignId))) {
    if (!campaignType.has(id)) {
      const t = mostFrequent(detail.filter((r) => r.campaignId === id && r.results > 0).map((r) => r.resultType));
      if (t) campaignType.set(id, t);
    }
  }
  const typeOf = (r: Row): string | null => (r.adsetId ? adsetType.get(r.adsetId) : undefined) ?? campaignType.get(r.campaignId) ?? null;

  // Objetivos = tipos de Resultado con resultados en el mes, de mayor a menor inversión.
  const spendByType = new Map<string, number>();
  const resultsByType = new Map<string, number>();
  for (const r of dailyRows) {
    const t = typeOf(r);
    if (!t) continue;
    spendByType.set(t, (spendByType.get(t) ?? 0) + r.spend);
    resultsByType.set(t, (resultsByType.get(t) ?? 0) + r.results);
  }
  const objectiveLabels = [...spendByType.keys()]
    .filter((t) => (resultsByType.get(t) ?? 0) > 0)
    .sort((a, b) => (spendByType.get(b) ?? 0) - (spendByType.get(a) ?? 0));
  const objectiveIndex = new Map(objectiveLabels.map((label, i) => [label, i]));
  const zeros = () => objectiveLabels.map(() => 0);
  const matchIndex = (r: Row): number | null => {
    const t = typeOf(r);
    return t === null ? null : (objectiveIndex.get(t) ?? null);
  };

  // ── Nombres de campañas, conjuntos y anuncios (ordenados por gasto, como con la API).
  const campaignNames = new Map<string, string>();
  const adsetInfo = new Map<string, { name: string; campaignId: string }>();
  const adInfo = new Map<string, { name: string; campaignId: string; adsetId?: string }>();
  const spendBy = { campaign: new Map<string, number>(), adset: new Map<string, number>(), ad: new Map<string, number>() };
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  // ── Días.
  const byDate = new Map<string, DailyRealTotals>();
  for (const r of dailyRows) {
    let day = byDate.get(r.day!);
    if (!day) {
      day = {
        date: r.day!,
        spend: 0,
        leadsByType: zeroByType(),
        spendByType: zeroByType(),
        objectiveLeads: zeros(),
        objectiveSpend: zeros(),
        interactions: 0,
        purchases: 0,
        purchaseValue: 0,
        clicks: 0,
        objectiveInteractions: zeros(),
        objectiveClicks: zeros(),
        reach: 0,
        impressions: 0,
        totalClicks: 0,
        byAd: {},
      };
      byDate.set(r.day!, day);
    }
    day.spend += r.spend;
    day.reach += r.reach;
    day.impressions += r.impressions;
    day.totalClicks += r.clicksAll;
    day.interactions += r.interactions;
    day.clicks += r.linkClicks;

    campaignNames.set(r.campaignId, r.campaignName);
    add(spendBy.campaign, r.campaignId, r.spend);
    if (r.adsetId) {
      adsetInfo.set(r.adsetId, { name: r.adsetName ?? r.adsetId, campaignId: r.campaignId });
      add(spendBy.adset, r.adsetId, r.spend);
    }

    const index = matchIndex(r);
    let adEntry: DailyRealTotals["byAd"][string] | undefined;
    if (r.adId) {
      adInfo.set(r.adId, { name: r.adName ?? r.adId, campaignId: r.campaignId, adsetId: r.adsetId ?? undefined });
      add(spendBy.ad, r.adId, r.spend);
      adEntry = day.byAd[r.adId] ??= {
        campaignId: r.campaignId,
        adsetId: r.adsetId ?? undefined,
        spend: 0,
        objectiveLeads: zeros(),
        objectiveSpend: zeros(),
        reach: 0,
        impressions: 0,
        totalClicks: 0,
      };
      adEntry.spend += r.spend;
      adEntry.reach += r.reach;
      adEntry.impressions += r.impressions;
      adEntry.totalClicks += r.clicksAll;
    }
    if (index !== null) {
      day.objectiveLeads[index]! += r.results;
      day.objectiveSpend[index]! += r.spend;
      day.objectiveInteractions[index]! += r.interactions;
      day.objectiveClicks[index]! += r.linkClicks;
      if (adEntry) {
        adEntry.objectiveLeads[index]! += r.results;
        adEntry.objectiveSpend[index]! += r.spend;
      }
      if (index < LEAD_TYPES.length) {
        const type = LEAD_TYPES[index]!;
        day.leadsByType[type] += r.results;
        day.spendByType[type] += r.spend;
      }
    }
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  // ── Quién responde a los anuncios (Edad × Sexo). Los de sexo "unknown" se descartan, igual que
  //    con la API (ver META_GENDER_TO_LABEL en metaInvestmentData.ts).
  const audienceRows = pickRows(detail, [
    { day: false, age: true, gender: true },
    { day: true, age: true, gender: true },
  ]);
  const audience = new Map<string, AudienceSegmentTotals>();
  for (const r of audienceRows) {
    const gender = GENDER_LABEL[r.gender!.toLowerCase()];
    if (!gender || !/\d/.test(r.age!)) continue;
    const key = `${gender}|${r.age}`;
    const seg = audience.get(key) ?? {
      gender,
      ageRange: r.age!,
      objectiveLeads: zeros(),
      objectiveSpend: zeros(),
      reach: 0,
      impressions: 0,
      byAd: {},
    };
    audience.set(key, seg);
    seg.reach += r.reach;
    seg.impressions += r.impressions;
    const index = matchIndex(r);
    if (index !== null) {
      seg.objectiveLeads[index]! += r.results;
      seg.objectiveSpend[index]! += r.spend;
    }
    if (r.adId) {
      const entry = (seg.byAd[r.adId] ??= {
        campaignId: r.campaignId,
        adsetId: r.adsetId ?? undefined,
        spend: 0,
        objectiveLeads: zeros(),
        objectiveSpend: zeros(),
        reach: 0,
        impressions: 0,
      });
      entry.spend += r.spend;
      entry.reach += r.reach;
      entry.impressions += r.impressions;
      if (index !== null) {
        entry.objectiveLeads[index]! += r.results;
        entry.objectiveSpend[index]! += r.spend;
      }
    }
  }
  const audienceSegments = [...audience.values()];

  // ── Porcentaje de visualización por edad.
  const ageRows = pickRows(detail, [
    { day: false, age: true, gender: false },
    { day: false, age: true, gender: true },
    { day: true, age: true, gender: false },
    { day: true, age: true, gender: true },
  ]);
  const video = new Map<string, VideoRetentionByAge>();
  for (const r of ageRows) {
    if (!/\d/.test(r.age!) || r.videoPlays <= 0) continue;
    const seg = video.get(r.age!) ?? { ageRange: r.age!, videoPlays: 0, p25: 0, p50: 0, p75: 0, p95: 0, p100: 0, byAd: {} };
    video.set(r.age!, seg);
    seg.videoPlays += r.videoPlays;
    seg.p25 += r.p25;
    seg.p50 += r.p50;
    seg.p75 += r.p75;
    seg.p95 += r.p95;
    seg.p100 += r.p100;
    if (r.adId) {
      const entry = (seg.byAd[r.adId] ??= { campaignId: r.campaignId, adsetId: r.adsetId ?? undefined, videoPlays: 0, p25: 0, p50: 0, p75: 0, p95: 0, p100: 0 });
      entry.videoPlays += r.videoPlays;
      entry.p25 += r.p25;
      entry.p50 += r.p50;
      entry.p75 += r.p75;
      entry.p95 += r.p95;
      entry.p100 += r.p100;
    }
  }
  const videoRetentionByAge = [...video.values()].sort((a, b) => a.ageRange.localeCompare(b.ageRange));

  const bySpend = (m: Map<string, number>) => (a: { id: string }, b: { id: string }) => (m.get(b.id) ?? 0) - (m.get(a.id) ?? 0);
  const campaigns = [...campaignNames].map(([id, name]) => ({ id, name })).sort(bySpend(spendBy.campaign));
  const campaignRanking: CampaignRankingEntry[] = campaigns.map((c) => ({ ...c, status: campaignStatusById.get(c.id) ?? null }));
  const adsets = [...adsetInfo].map(([id, v]) => ({ id, ...v })).sort(bySpend(spendBy.adset));
  const ads = [...adInfo].map(([id, v]) => ({ id, ...v })).sort(bySpend(spendBy.ad));

  // Alcance del mes: Meta no da un alcance deduplicado de toda la cuenta en este export; se usa la
  // suma del alcance de cada campaña (fila de nivel campaign), o el de las filas por día si el
  // export no trae esas filas. Puede contar dos veces a quien vio más de una campaña.
  const monthlyReach =
    campaignReach.size > 0 ? [...campaignReach.values()].reduce((s, v) => s + v, 0) : days.reduce((s, d) => s + d.reach, 0);

  const typeLabels = { ...LEAD_TYPE_LABEL } as Record<LeadType, string>;
  LEAD_TYPES.forEach((type, i) => {
    if (objectiveLabels[i]) typeLabels[type] = objectiveLabels[i]!;
  });

  const currency = found.header.currency || "USD";
  const data: RealInvestmentCalendarData = {
    source: "excel",
    currency,
    monthlyBudget: null,
    typeLabels,
    configuredTypeCount: Math.min(objectiveLabels.length, LEAD_TYPES.length),
    objectiveLabels,
    objectiveActionTypes: objectiveLabels.map(() => null),
    monthlyReach,
    campaigns,
    campaignRanking,
    adsets,
    ads,
    detectedActionTypes: [],
    days,
    audienceSegments,
    regionSegments: [],
    hourlyTotals: [],
    videoRetentionByAge,
    placementSegments: [],
  };

  return {
    month,
    data,
    summary: {
      spend: days.reduce((s, d) => s + d.spend, 0),
      currency,
      days: days.length,
      campaigns: campaigns.length,
      ads: ads.length,
      hasAudience: audienceSegments.length > 0,
      hasVideo: videoRetentionByAge.length > 0,
    },
  };
}

function zeroByType(): Record<LeadType, number> {
  return { chat: 0, formLanding: 0, formMeta: 0 };
}
