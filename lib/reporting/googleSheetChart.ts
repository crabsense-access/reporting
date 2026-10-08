// Gráfico a partir de un Google Sheet público (ver sheet_chart en MetaAdsConfig, lib/types.ts).
//
// El admin pega el link de un Sheet compartido como "Cualquier persona con el enlace" (o publicado
// en la web) y acá se baja como CSV — sin OAuth ni API key, sólo funciona si el archivo es público.
// Interpretación AUTOMÁTICA de la tabla (a pedido de Martín):
//   - fila 1 = encabezados
//   - columna 1 = eje X (fechas o categorías)
//   - cada columna siguiente con al menos un valor numérico = una serie
//   - si el eje X son fechas → gráfico de líneas; si no → barras.

export interface SheetChartSeries {
  name: string;
  /** Un valor por fila (null si la celda está vacía o no es numérica). */
  values: (number | null)[];
  /** La serie es un monto de dinero (se muestra con formato de moneda) — ver isCurrencySeries. */
  isCurrency: boolean;
}

/** Palabras del encabezado que indican que la columna es un monto ("Facturación", "Ticket promedio", etc.). */
const CURRENCY_HEADER = /factur|ticket|ingreso|revenue|venta[s]?\s*\$|monto|importe|inversi[oó]n|gasto|costo|precio|valor|\$|\bars\b|\busd\b/i;

/** Una columna es monetaria si su encabezado lo sugiere o si alguna celda trae símbolo de moneda. */
export function isCurrencySeries(header: string, cells: string[]): boolean {
  return CURRENCY_HEADER.test(header) || cells.some((c) => /\$|ARS|USD/i.test(c));
}

export interface SheetChartData {
  title: string | null;
  subtitle?: string | null;
  xLabel: string;
  /** Etiquetas del eje X tal cual vienen del Sheet (o normalizadas a dd/MM/yyyy si son fechas). */
  labels: string[];
  series: SheetChartSeries[];
  kind: "line" | "bar";
}

export class SheetChartError extends Error {}

/**
 * Convierte cualquier link de Google Sheets en su URL de exportación CSV. Soporta:
 *   - https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>  (compartido con el enlace)
 *   - https://docs.google.com/spreadsheets/d/e/<PUB_ID>/pubhtml?gid=<GID> (publicado en la web)
 * Respeta la pestaña (gid) del link; si no tiene, usa la primera.
 */
export function toSheetCsvUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new SheetChartError("El link no es una URL válida.");
  }
  if (url.hostname !== "docs.google.com" || !url.pathname.startsWith("/spreadsheets/")) {
    throw new SheetChartError("El link tiene que ser de Google Sheets (docs.google.com/spreadsheets/...).");
  }

  const gid = url.searchParams.get("gid") ?? new URLSearchParams(url.hash.replace(/^#/, "")).get("gid");

  const published = url.pathname.match(/^\/spreadsheets\/d\/e\/([^/]+)/);
  if (published) {
    const csv = new URL(`https://docs.google.com/spreadsheets/d/e/${published[1]}/pub`);
    csv.searchParams.set("output", "csv");
    if (gid) csv.searchParams.set("gid", gid);
    return csv.toString();
  }

  const shared = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
  if (shared) {
    const csv = new URL(`https://docs.google.com/spreadsheets/d/${shared[1]}/export`);
    csv.searchParams.set("format", "csv");
    if (gid) csv.searchParams.set("gid", gid);
    return csv.toString();
  }

  throw new SheetChartError("No se pudo reconocer el ID del Google Sheet en el link.");
}

/** Parser CSV mínimo (RFC 4180): comillas, comillas escapadas ("") y saltos de línea dentro de celdas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Número desde una celda, tolerando formato es-AR ("1.234,56"), en-US ("1,234.56"), símbolos de
 * moneda y "%". Devuelve null si la celda no es numérica.
 */
export function parseSheetNumber(raw: string, locale: NumberLocale | null = null): number | null {
  let s = raw.trim().replace(/[\s$€%]|ARS|USD|US\$/gi, "");
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s);
  if (negative) s = s.slice(1, -1);

  if (locale === "es") {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (locale === "en") {
    s = s.replace(/,/g, "");
  }

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // El separador que aparece último es el decimal.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Sólo comas: "1,5" = decimal; "1,234" o "1,234,567" = miles.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" / "1.234.567" = miles (formato es-AR, el de los clientes de la agencia).
    s = s.replace(/\./g, "");
  }

  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

export type NumberLocale = "es" | "en";

/**
 * Detecta si una columna usa formato es-AR ("2.000", "1,5") o en-US ("2,000", "1.5") mirando las
 * celdas que no son ambiguas. Google Sheets exporta el CSV con el formato regional del archivo,
 * así que un Sheet en español trae "2.000" = dos mil. Si no hay pistas, null (heurística por celda).
 */
export function detectNumberLocale(cells: string[]): NumberLocale | null {
  let es = 0;
  let en = 0;
  for (const raw of cells) {
    const c = raw.replace(/[^\d.,-]/g, "");
    if (/\d,\d{1,2}$/.test(c) || /\d\.\d{3}(\.|,|$)/.test(c)) es++;
    else if (/\d\.\d{1,2}$/.test(c) || /\d,\d{3}(,|\.|$)/.test(c)) en++;
  }
  if (es === en) return null;
  return es > en ? "es" : "en";
}

/** Fecha desde una celda (dd/MM/yyyy, d/M/yy, yyyy-MM-dd). null si no parece una fecha. */
export function parseSheetDate(raw: string): Date | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return safeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return safeDate(year, Number(m[2]), Number(m[1]));
  }
  return null;
}

function safeDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d : null;
}

function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Arma los datos del gráfico a partir de las filas del CSV (ver reglas en el encabezado). */
export function buildSheetChartData(rows: string[][], title: string | null): SheetChartData {
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (clean.length < 2) {
    throw new SheetChartError("El Sheet necesita una fila de encabezados y al menos una fila de datos.");
  }
  const [header, ...body] = clean as [string[], ...string[][]];
  const dataRows = body.filter((r) => (r[0] ?? "").trim() !== "");
  if (dataRows.length === 0) throw new SheetChartError("La primera columna (eje X) está vacía.");

  const series: SheetChartSeries[] = [];
  for (let col = 1; col < header.length; col++) {
    const locale = detectNumberLocale(dataRows.map((r) => r[col] ?? ""));
    const values = dataRows.map((r) => parseSheetNumber(r[col] ?? "", locale));
    if (values.some((v) => v !== null)) {
      const name = header[col]?.trim() || `Serie ${col}`;
      series.push({ name, values, isCurrency: isCurrencySeries(name, dataRows.map((r) => r[col] ?? "")) });
    }
  }
  if (series.length === 0) {
    throw new SheetChartError("No se encontró ninguna columna numérica (a partir de la columna B) para graficar.");
  }

  const dates = dataRows.map((r) => parseSheetDate(r[0] ?? ""));
  const isDateAxis = dates.every((d) => d !== null);

  let order = dataRows.map((_, i) => i);
  if (isDateAxis) order = order.sort((a, b) => dates[a]!.getTime() - dates[b]!.getTime());

  return {
    title,
    xLabel: header[0]?.trim() ?? "",
    labels: order.map((i) => (isDateAxis ? formatDate(dates[i]!) : dataRows[i]![0]!.trim())),
    series: series.map((s) => ({ ...s, values: order.map((i) => s.values[i]!) })),
    kind: isDateAxis ? "line" : "bar",
  };
}

/** Baja el Sheet público y arma los datos del gráfico. Cachea 5 minutos (fetch de Next). */
export async function fetchSheetChartData(sheetUrl: string, title: string | null = null): Promise<SheetChartData> {
  const csvUrl = toSheetCsvUrl(sheetUrl);
  let res: Response;
  try {
    res = await fetch(csvUrl, { next: { revalidate: 300 }, redirect: "follow" });
  } catch {
    throw new SheetChartError("No se pudo conectar con Google Sheets.");
  }
  const contentType = res.headers.get("content-type") ?? "";
  // Un Sheet privado no da 403: redirige al login de Google y devuelve HTML.
  if (!res.ok || contentType.includes("text/html")) {
    throw new SheetChartError(
      "No se pudo leer el Sheet. Verificá que esté compartido como \"Cualquier persona con el enlace\" (o publicado en la web)."
    );
  }
  return buildSheetChartData(parseCsv(await res.text()), title);
}

// ─── Comparación mes seleccionado vs. mes anterior ──────────────────────────────────────────────
// El informe ya no muestra el Sheet entero: toma la fila del mes que se está mirando en el
// Calendario de inversión y la del mes anterior (ver SheetChart.tsx).

const MONTH_NAMES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9,
  october: 10, november: 11, december: 12, jan: 1, apr: 4, aug: 8, dec: 12,
};

/**
 * Mes ("yyyy-MM") de una etiqueta del eje X. Acepta "Octubre", "Octubre 2026", "oct-26",
 * "10/2026", "2026-10", o una fecha completa ("dd/MM/yyyy"). Si la etiqueta trae sólo el nombre del
 * mes (sin año), se asume la ocurrencia más reciente que no sea posterior a `referenceMonth`
 * (ej. con referencia 2027-01, "Diciembre" = 2026-12).
 */
export function resolveMonthKey(label: string, referenceMonth: string): string | null {
  const s = label.trim().toLowerCase();
  const [refYear, refMonth] = referenceMonth.split("-").map(Number) as [number, number];
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

  const date = parseSheetDate(label);
  if (date) return key(date.getUTCFullYear(), date.getUTCMonth() + 1);

  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return key(Number(m[1]), Number(m[2]));
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return key(Number(m[2]), Number(m[1]));

  m = s.match(/^([a-záéíóú]+)\.?(?:[\s\-/]+(?:de\s+)?(\d{2}|\d{4}))?$/);
  if (m) {
    const month = MONTH_NAMES[m[1]!.normalize("NFD").replace(/[̀-ͯ]/g, "")];
    if (!month) return null;
    if (m[2]) return key(m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]), month);
    return key(month > refMonth ? refYear - 1 : refYear, month);
  }
  return null;
}

/** Mes anterior a "yyyy-MM". */
export function previousMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface SheetMonthComparison {
  name: string;
  isCurrency: boolean;
  current: number | null;
  previous: number | null;
  /** Variación % del mes seleccionado vs. el anterior (null si falta alguno de los dos o el anterior es 0). */
  variationPct: number | null;
}

/**
 * Valor de cada serie para `month` y para el mes anterior. Si hay varias filas del mismo mes
 * (ej. el Sheet es diario), se suman.
 */
export function compareMonths(chart: SheetChartData, month: string): SheetMonthComparison[] {
  const prevMonth = previousMonthKey(month);
  const keys = chart.labels.map((label) => resolveMonthKey(label, month));
  const sumFor = (values: (number | null)[], target: string) => {
    let total: number | null = null;
    values.forEach((v, i) => {
      if (keys[i] === target && v !== null) total = (total ?? 0) + v;
    });
    return total as number | null;
  };
  return chart.series.map((s) => {
    const current = sumFor(s.values, month);
    const previous = sumFor(s.values, prevMonth);
    const variationPct =
      current !== null && previous !== null && previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null;
    return { name: s.name, isCurrency: s.isCurrency, current, previous, variationPct };
  });
}
