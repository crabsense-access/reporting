import type Anthropic from "@anthropic-ai/sdk";
import { protos as ga4Protos } from "@google-analytics/data";

import { getGA4Client } from "@/lib/ga4/client";
import { getGSCClient } from "@/lib/gsc/client";
import { getGoogleAdsClient } from "@/lib/google-ads/client";
import { fetchMetaGraphApi } from "@/lib/meta-ads/client";
import { formatCurrency, formatDecimal, formatDuration, formatNumber, formatPercent } from "@/lib/format";
import type {
  DataSource,
  DataSourceType,
  GA4Config,
  GSCConfig,
  GoogleAdsConfig,
  MetaAdsConfig,
} from "@/lib/types";

interface ToolDateRange {
  from: string;
  to: string;
}

type ToolExecutor = (input: Record<string, unknown>) => Promise<unknown>;

interface ToolDefinition {
  tool: Anthropic.Tool;
  createExecutor(config: Record<string, unknown>): ToolExecutor;
}

function dateRangeSchema() {
  return {
    type: "object" as const,
    properties: {
      from: { type: "string", description: "Fecha desde, formato YYYY-MM-DD." },
      to: { type: "string", description: "Fecha hasta, formato YYYY-MM-DD." },
    },
    required: ["from", "to"],
  };
}

function asDateRange(input: Record<string, unknown>): ToolDateRange {
  const dateRange = input.dateRange as Record<string, unknown> | undefined;
  const from = dateRange?.from;
  const to = dateRange?.to;
  if (typeof from !== "string" || typeof to !== "string") {
    throw new Error("dateRange.from y dateRange.to son obligatorios.");
  }
  return { from, to };
}

// ----------------------------------------------------------------------------
// query_search_console
// ----------------------------------------------------------------------------

const GSC_DIMENSIONS = ["page", "query", "date", "country", "device"] as const;

const searchConsoleTool: ToolDefinition = {
  tool: {
    name: "query_search_console",
    description:
      "Consulta datos agregados de Search Console (clics, impresiones, CTR, posición) del sitio del cliente, agrupados por las dimensiones pedidas.",
    input_schema: {
      type: "object",
      properties: {
        dimensions: {
          type: "array",
          items: { type: "string", enum: [...GSC_DIMENSIONS] },
          description: "Dimensiones por las que agrupar (al menos una).",
        },
        dateRange: dateRangeSchema(),
      },
      required: ["dimensions", "dateRange"],
    },
  },
  createExecutor(config) {
    const gscConfig = config as unknown as GSCConfig;
    return async (input) => {
      const dimensions = input.dimensions;
      if (!Array.isArray(dimensions) || dimensions.length === 0) {
        throw new Error("dimensions debe ser un array con al menos un elemento.");
      }
      const { from, to } = asDateRange(input);

      const client = getGSCClient();
      const response = await client.searchanalytics.query({
        siteUrl: gscConfig.site_url,
        requestBody: {
          startDate: from,
          endDate: to,
          dimensions: dimensions as string[],
          rowLimit: 25,
        },
      });

      const rows = response.data.rows ?? [];
      let totalClicks = 0;
      let totalImpressions = 0;
      let weightedPosition = 0;

      const formattedRows = rows.map((row) => {
        const clicks = row.clicks ?? 0;
        const impressions = row.impressions ?? 0;
        const ctr = row.ctr ?? 0;
        const position = row.position ?? 0;
        totalClicks += clicks;
        totalImpressions += impressions;
        weightedPosition += position * impressions;

        const dimensionValues = Object.fromEntries(
          (dimensions as string[]).map((dimension, index) => [dimension, row.keys?.[index] ?? ""])
        );

        return {
          ...dimensionValues,
          clicks: formatNumber(clicks),
          impressions: formatNumber(impressions),
          ctr: formatPercent(ctr),
          position: formatDecimal(position, 1),
        };
      });

      const totales =
        totalImpressions > 0
          ? {
              clicks: formatNumber(totalClicks),
              impressions: formatNumber(totalImpressions),
              ctr: formatPercent(totalImpressions > 0 ? totalClicks / totalImpressions : 0),
              position: formatDecimal(weightedPosition / totalImpressions, 1),
            }
          : null;

      return { rows: formattedRows, totales };
    };
  },
};

// ----------------------------------------------------------------------------
// query_ga4
// ----------------------------------------------------------------------------

const GA4_METRICS = [
  "sessions",
  "activeUsers",
  "newUsers",
  "screenPageViews",
  "conversions",
  "engagementRate",
  "bounceRate",
  "averageSessionDuration",
] as const;

const GA4_DIMENSIONS = ["date", "deviceCategory", "sessionDefaultChannelGroup", "country", "pagePath"] as const;

const GA4_RATE_METRICS = new Set(["engagementRate", "bounceRate"]);

function formatGA4MetricValue(metricName: string, rawValue: string): string {
  const value = Number(rawValue);
  if (Number.isNaN(value)) return rawValue;
  if (metricName === "averageSessionDuration") return formatDuration(value);
  if (GA4_RATE_METRICS.has(metricName)) return formatPercent(value);
  return formatNumber(value);
}

const ga4Tool: ToolDefinition = {
  tool: {
    name: "query_ga4",
    description: "Consulta métricas de Google Analytics 4 del cliente, opcionalmente agrupadas por dimensiones.",
    input_schema: {
      type: "object",
      properties: {
        metrics: {
          type: "array",
          items: { type: "string", enum: [...GA4_METRICS] },
          description: "Métricas de GA4 a traer (al menos una).",
        },
        dimensions: {
          type: "array",
          items: { type: "string", enum: [...GA4_DIMENSIONS] },
          description: "Dimensiones opcionales para agrupar los resultados.",
        },
        dateRange: dateRangeSchema(),
      },
      required: ["metrics", "dateRange"],
    },
  },
  createExecutor(config) {
    const ga4Config = config as unknown as GA4Config;
    return async (input) => {
      const metrics = input.metrics;
      if (!Array.isArray(metrics) || metrics.length === 0) {
        throw new Error("metrics debe ser un array con al menos un elemento.");
      }
      const dimensions = Array.isArray(input.dimensions) ? (input.dimensions as string[]) : [];
      const { from, to } = asDateRange(input);

      const client = getGA4Client();
      const [response] = await client.runReport({
        property: `properties/${ga4Config.property_id}`,
        dateRanges: [{ startDate: from, endDate: to }],
        metrics: (metrics as string[]).map((name) => ({ name })),
        dimensions: dimensions.map((name) => ({ name })),
        metricAggregations: [ga4Protos.google.analytics.data.v1beta.MetricAggregation.TOTAL],
        // Sin límite explícito, la API de GA4 puede devolver miles de filas con dimensiones de
        // alta cardinalidad (ej. pagePath) — mismo tope que Meta Ads/Google Ads (ver más abajo).
        limit: 50,
      });

      const rows = (response.rows ?? []).map((row) => {
        const dimensionValues = Object.fromEntries(
          dimensions.map((dimension, index) => [dimension, row.dimensionValues?.[index]?.value ?? ""])
        );
        const metricValues = Object.fromEntries(
          (metrics as string[]).map((metric, index) => [
            metric,
            formatGA4MetricValue(metric, row.metricValues?.[index]?.value ?? "0"),
          ])
        );
        return { ...dimensionValues, ...metricValues };
      });

      const totalsRow = response.totals?.[0];
      const totales = totalsRow
        ? Object.fromEntries(
            (metrics as string[]).map((metric, index) => [
              metric,
              formatGA4MetricValue(metric, totalsRow.metricValues?.[index]?.value ?? "0"),
            ])
          )
        : null;

      return { rows, totales };
    };
  },
};

// ----------------------------------------------------------------------------
// query_meta_ads
// ----------------------------------------------------------------------------

const META_BREAKDOWN_MAP: Record<string, string> = {
  platform: "publisher_platform",
  device: "device_platform",
  age: "age",
  gender: "gender",
  region: "region",
};

interface MetaInsightRow {
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: { action_type: string; value: string }[];
  publisher_platform?: string;
  device_platform?: string;
  age?: string;
  gender?: string;
  region?: string;
}

interface MetaInsightsResponse {
  data: MetaInsightRow[];
}

const metaAdsTool: ToolDefinition = {
  tool: {
    name: "query_meta_ads",
    description: "Consulta métricas de Meta Ads (spend, impresiones, clics, conversiones, ctr, cpc, cpm) del cliente.",
    input_schema: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["campaign", "adset", "ad"],
          description: "Nivel de agregación de los datos.",
        },
        breakdown: {
          type: "string",
          enum: ["platform", "device", "age", "gender", "region"],
          description: "Desglose opcional de los resultados.",
        },
        dateRange: dateRangeSchema(),
      },
      required: ["level", "dateRange"],
    },
  },
  createExecutor(config) {
    const metaConfig = config as unknown as MetaAdsConfig;
    return async (input) => {
      const level = input.level;
      if (level !== "campaign" && level !== "adset" && level !== "ad") {
        throw new Error('level debe ser "campaign", "adset" o "ad".');
      }
      const breakdownInput = typeof input.breakdown === "string" ? input.breakdown : undefined;
      const breakdown = breakdownInput ? META_BREAKDOWN_MAP[breakdownInput] : undefined;
      const { from, to } = asDateRange(input);

      const accountId = metaConfig.ad_account_id;

      const [insights, accountInfo] = await Promise.all([
        fetchMetaGraphApi<MetaInsightsResponse>(`${accountId}/insights`, {
          level,
          ...(breakdown ? { breakdowns: breakdown } : {}),
          time_range: JSON.stringify({ since: from, until: to }),
          fields: "campaign_name,adset_name,ad_name,spend,impressions,clicks,ctr,cpc,cpm,actions",
          limit: "50",
        }),
        fetchMetaGraphApi<{ currency?: string }>(accountId, { fields: "currency" }),
      ]);

      const currency = accountInfo.currency ?? "USD";

      const rows = insights.data.map((row) => {
        const totalActions = (row.actions ?? []).reduce((sum, action) => sum + Number(action.value ?? 0), 0);
        return {
          campaign_name: row.campaign_name ?? null,
          adset_name: row.adset_name ?? null,
          ad_name: row.ad_name ?? null,
          publisher_platform: row.publisher_platform ?? null,
          device_platform: row.device_platform ?? null,
          age: row.age ?? null,
          gender: row.gender ?? null,
          region: row.region ?? null,
          spend: formatCurrency(Number(row.spend ?? 0), currency),
          impressions: formatNumber(Number(row.impressions ?? 0)),
          clicks: formatNumber(Number(row.clicks ?? 0)),
          ctr: `${formatDecimal(Number(row.ctr ?? 0), 2)}%`,
          cpc: formatCurrency(Number(row.cpc ?? 0), currency),
          cpm: formatCurrency(Number(row.cpm ?? 0), currency),
          conversiones: formatNumber(totalActions),
        };
      });

      return { rows, moneda: currency };
    };
  },
};

// ----------------------------------------------------------------------------
// query_google_ads
// ----------------------------------------------------------------------------

const GOOGLE_ADS_METRIC_FIELDS: Record<string, string> = {
  impressions: "metrics.impressions",
  clicks: "metrics.clicks",
  cost: "metrics.cost_micros",
  conversions: "metrics.conversions",
  ctr: "metrics.ctr",
  averageCpc: "metrics.average_cpc",
};

const GOOGLE_ADS_DIMENSION_FIELDS: Record<string, string> = {
  date: "segments.date",
  campaign: "campaign.name",
  device: "segments.device",
};

interface GoogleAdsRow {
  campaign?: { name?: string | null } | null;
  segments?: { date?: string | null; device?: string | null } | null;
  metrics?: {
    impressions?: number | null;
    clicks?: number | null;
    cost_micros?: number | null;
    conversions?: number | null;
    ctr?: number | null;
    average_cpc?: number | null;
  } | null;
}

function formatGoogleAdsMetricValue(metric: string, row: GoogleAdsRow): string {
  const metrics = row.metrics ?? {};
  if (metric === "cost") return formatDecimal((metrics.cost_micros ?? 0) / 1_000_000, 2);
  if (metric === "averageCpc") return formatDecimal((metrics.average_cpc ?? 0) / 1_000_000, 2);
  if (metric === "ctr") return formatPercent(metrics.ctr ?? 0);
  if (metric === "impressions") return formatNumber(metrics.impressions ?? 0);
  if (metric === "clicks") return formatNumber(metrics.clicks ?? 0);
  if (metric === "conversions") return formatNumber(metrics.conversions ?? 0);
  return "";
}

function readGoogleAdsDimensionValue(dimension: string, row: GoogleAdsRow): string {
  if (dimension === "date") return row.segments?.date ?? "";
  if (dimension === "campaign") return row.campaign?.name ?? "";
  if (dimension === "device") return String(row.segments?.device ?? "");
  return "";
}

const googleAdsTool: ToolDefinition = {
  tool: {
    name: "query_google_ads",
    description: "Consulta métricas de Google Ads (impresiones, clics, costo, conversiones, ctr, cpc promedio) del cliente.",
    input_schema: {
      type: "object",
      properties: {
        metrics: {
          type: "array",
          items: { type: "string", enum: Object.keys(GOOGLE_ADS_METRIC_FIELDS) },
          description: "Métricas de Google Ads a traer (al menos una).",
        },
        dimensions: {
          type: "array",
          items: { type: "string", enum: Object.keys(GOOGLE_ADS_DIMENSION_FIELDS) },
          description: "Dimensiones opcionales para agrupar los resultados.",
        },
        dateRange: dateRangeSchema(),
      },
      required: ["metrics", "dateRange"],
    },
  },
  createExecutor(config) {
    const googleAdsConfig = config as unknown as GoogleAdsConfig;
    return async (input) => {
      const metrics = input.metrics;
      if (!Array.isArray(metrics) || metrics.length === 0) {
        throw new Error("metrics debe ser un array con al menos un elemento.");
      }
      const dimensions = Array.isArray(input.dimensions) ? (input.dimensions as string[]) : [];
      const { from, to } = asDateRange(input);

      const selectFields = [
        ...dimensions.map((dimension) => GOOGLE_ADS_DIMENSION_FIELDS[dimension]),
        ...(metrics as string[]).map((metric) => GOOGLE_ADS_METRIC_FIELDS[metric]),
      ].filter(Boolean);

      const gaql = `SELECT ${selectFields.join(", ")} FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' LIMIT 50`;

      const customer = getGoogleAdsClient(googleAdsConfig.customer_id);
      const rows = (await customer.query(gaql)) as GoogleAdsRow[];

      const formattedRows = rows.map((row) => {
        const dimensionValues = Object.fromEntries(
          dimensions.map((dimension) => [dimension, readGoogleAdsDimensionValue(dimension, row)])
        );
        const metricValues = Object.fromEntries(
          (metrics as string[]).map((metric) => [metric, formatGoogleAdsMetricValue(metric, row)])
        );
        return { ...dimensionValues, ...metricValues };
      });

      return { rows: formattedRows };
    };
  },
};

// ----------------------------------------------------------------------------

const TOOL_DEFINITIONS: Partial<Record<DataSourceType, ToolDefinition>> = {
  search_console: searchConsoleTool,
  ga4: ga4Tool,
  meta_ads: metaAdsTool,
  google_ads: googleAdsTool,
};

export interface Toolset {
  tools: Anthropic.Tool[];
  executors: Map<string, ToolExecutor>;
}

// Arma la lista de tools y sus ejecutores solo para las fuentes que este cliente tiene
// efectivamente conectadas (data_sources), consultada antes de llamar a Claude.
export function buildToolset(dataSources: DataSource[]): Toolset {
  const tools: Anthropic.Tool[] = [];
  const executors = new Map<string, ToolExecutor>();

  for (const dataSource of dataSources) {
    const definition = TOOL_DEFINITIONS[dataSource.source_type];
    if (!definition) continue;
    tools.push(definition.tool);
    executors.set(definition.tool.name, definition.createExecutor(dataSource.config));
  }

  return { tools, executors };
}
