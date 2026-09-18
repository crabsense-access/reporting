export type ReportSectionType = "metricas" | "texto" | "ranking" | "comparacion";

export type ReportSentiment = "positivo" | "negativo" | "neutral";

export interface ReportMetric {
  label: string;
  valor: string;
  variacion: string | null;
  sentimiento: ReportSentiment | null;
}

export interface ReportRankingItem {
  nombre: string;
  valor: string;
}

export interface ReportComparisonItem {
  etiqueta: string;
  actual: string;
  anterior: string;
}

export interface ReportSection {
  titulo: string;
  tipo: ReportSectionType;
  metricas: ReportMetric[] | null;
  texto: string | null;
  items: ReportRankingItem[] | null;
  comparaciones: ReportComparisonItem[] | null;
}

export interface ReportContent {
  titulo: string;
  periodo: { desde: string; hasta: string };
  resumenEjecutivo: string;
  secciones: ReportSection[];
}

class ReportContentParseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new ReportContentParseError(`${path} debe ser un string (recibí: ${typeof value}).`);
  }
  return value;
}

function requireStringOrNull(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, path);
}

const SENTIMENTS: ReportSentiment[] = ["positivo", "negativo", "neutral"];
const SECTION_TYPES: ReportSectionType[] = ["metricas", "texto", "ranking", "comparacion"];

function parseMetric(raw: unknown, path: string): ReportMetric {
  if (!isRecord(raw)) {
    throw new ReportContentParseError(`${path} debe ser un objeto.`);
  }
  const sentimiento = raw.sentimiento;
  if (sentimiento !== null && sentimiento !== undefined && !SENTIMENTS.includes(sentimiento as ReportSentiment)) {
    throw new ReportContentParseError(`${path}.sentimiento inválido: ${String(sentimiento)}.`);
  }
  return {
    label: requireString(raw.label, `${path}.label`),
    valor: requireString(raw.valor, `${path}.valor`),
    variacion: requireStringOrNull(raw.variacion, `${path}.variacion`),
    sentimiento: (sentimiento as ReportSentiment | null | undefined) ?? null,
  };
}

function parseRankingItem(raw: unknown, path: string): ReportRankingItem {
  if (!isRecord(raw)) {
    throw new ReportContentParseError(`${path} debe ser un objeto.`);
  }
  return {
    nombre: requireString(raw.nombre, `${path}.nombre`),
    valor: requireString(raw.valor, `${path}.valor`),
  };
}

function parseComparisonItem(raw: unknown, path: string): ReportComparisonItem {
  if (!isRecord(raw)) {
    throw new ReportContentParseError(`${path} debe ser un objeto.`);
  }
  return {
    etiqueta: requireString(raw.etiqueta, `${path}.etiqueta`),
    actual: requireString(raw.actual, `${path}.actual`),
    anterior: requireString(raw.anterior, `${path}.anterior`),
  };
}

function parseSection(raw: unknown, path: string): ReportSection {
  if (!isRecord(raw)) {
    throw new ReportContentParseError(`${path} debe ser un objeto.`);
  }

  const tipo = raw.tipo;
  if (typeof tipo !== "string" || !SECTION_TYPES.includes(tipo as ReportSectionType)) {
    throw new ReportContentParseError(`${path}.tipo inválido: ${String(tipo)}.`);
  }

  const titulo = requireString(raw.titulo, `${path}.titulo`);

  let metricas: ReportMetric[] | null = null;
  let texto: string | null = null;
  let items: ReportRankingItem[] | null = null;
  let comparaciones: ReportComparisonItem[] | null = null;

  if (tipo === "metricas") {
    if (!Array.isArray(raw.metricas)) {
      throw new ReportContentParseError(`${path}.metricas debe ser un array (tipo="metricas").`);
    }
    metricas = raw.metricas.map((item, index) => parseMetric(item, `${path}.metricas[${index}]`));
  } else if (tipo === "texto") {
    texto = requireString(raw.texto, `${path}.texto`);
  } else if (tipo === "ranking") {
    if (!Array.isArray(raw.items)) {
      throw new ReportContentParseError(`${path}.items debe ser un array (tipo="ranking").`);
    }
    items = raw.items.map((item, index) => parseRankingItem(item, `${path}.items[${index}]`));
  } else if (tipo === "comparacion") {
    if (!Array.isArray(raw.comparaciones)) {
      throw new ReportContentParseError(`${path}.comparaciones debe ser un array (tipo="comparacion").`);
    }
    comparaciones = raw.comparaciones.map((item, index) =>
      parseComparisonItem(item, `${path}.comparaciones[${index}]`)
    );
  }

  return { titulo, tipo: tipo as ReportSectionType, metricas, texto, items, comparaciones };
}

// Valida la forma exacta del JSON que devuelve Claude antes de guardarlo — no confiamos en que
// el modelo respetó el esquema del system prompt al pie de la letra.
export function parseReportContent(raw: unknown): ReportContent {
  if (!isRecord(raw)) {
    throw new ReportContentParseError("La raíz del informe debe ser un objeto.");
  }

  const periodo = raw.periodo;
  if (!isRecord(periodo)) {
    throw new ReportContentParseError("periodo debe ser un objeto.");
  }

  if (!Array.isArray(raw.secciones)) {
    throw new ReportContentParseError("secciones debe ser un array.");
  }

  return {
    titulo: requireString(raw.titulo, "titulo"),
    periodo: {
      desde: requireString(periodo.desde, "periodo.desde"),
      hasta: requireString(periodo.hasta, "periodo.hasta"),
    },
    resumenEjecutivo: requireString(raw.resumenEjecutivo, "resumenEjecutivo"),
    secciones: raw.secciones.map((section, index) => parseSection(section, `secciones[${index}]`)),
  };
}
