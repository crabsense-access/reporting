import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/roles";
import { withCache, LONG_TTL_SECONDS, THREE_HOURS_SECONDS } from "@/lib/cache/withCache";
import { generateCampaignHighlights, generateChartInsight, generateChartInsightsByType, generateRecommendations } from "@/lib/reports/chartInsights";
import { isAnthropicPaused } from "@/lib/anthropic/client";
import {
  AUDIENCE_FALLBACKS,
  CAMPAIGN_HIGHLIGHTS_FALLBACK,
  INVESTMENT_TREND_FALLBACK,
  LEADS_BY_TYPE_FALLBACK,
  PLACEMENTS_FALLBACK,
  REGIONS_FALLBACKS,
  HOURLY_PERFORMANCE_FALLBACK,
  WEEKDAY_PERFORMANCE_FALLBACK,
  VIDEO_RETENTION_FALLBACK,
  RECOMMENDATIONS_FALLBACK,
} from "@/lib/reports/chartInsightFallbacks";

// POST /api/reporting/chart-insights
//
// Genera con Claude la leyenda de "hallazgos principales" (titular + texto +
// cifras destacadas) para un gráfico del calendario de inversión, a partir
// de las métricas que ya calculó el cliente — ver lib/reports/chartInsights.ts.
// No está anidada bajo /api/clients/[id] porque hoy trabaja sobre datos de
// prueba, iguales para cualquier cliente; el día que el calendario use datos
// reales de Meta Ads, esta ruta puede empezar a recibir clientId sin que el
// contrato con el front cambie.
//
// No pasa por el middleware (que solo protege /admin/*), así que re-chequea
// admin acá mismo — mismo patrón que app/api/clients/[id]/reporting-metrics.
//
// Cache: el body puede traer monthIsComplete (true cuando el mes consultado en el Calendario ya
// terminó — ver isCurrentMonth en InvestmentCalendar.tsx). SIEMPRE se cachea (ver
// lib/cache/withCache.ts, mismo mecanismo que ya usan GA4/Search Console/Meta Ads), pero con dos
// TTL distintos: un mes cerrado no le va a cambiar el texto a Claude nunca más, así que se cachea
// con el TTL largo normal de withCache (LONG_TTL_SECONDS); un mes en curso sí puede cambiar
// durante el día a medida que entran nuevos leads — antes esas respuestas NUNCA se cacheaban (se
// le pedía a Claude en cada carga de página), pero Martín pidió cachearlas también, con un TTL
// FIJO de 3 horas (THREE_HOURS_SECONDS) en vez de no cachear nada — mismo criterio que la data
// real del Calendario (ver fetchRealInvestmentCalendarDataCached en metaInvestmentData.ts).

const CHART_INSTRUCTIONS: Record<string, string> = {
  "investment-trend":
    'Estás mirando el gráfico "Inversión y rendimiento por día" del calendario de inversión de un ' +
    "cliente de marketing digital: barras de inversión diaria + una línea de CPL o Leads diarios, " +
    "para el mes en curso. Identificá el hallazgo principal (tendencia, pico o valle, día más o menos " +
    "eficiente, etc.) y redactalo para que un cliente no técnico lo entienda de un vistazo.",
  "leads-by-type":
    'Estás mirando el gráfico "Leads y CPL por tipo de campaña" del calendario de inversión de un ' +
    "cliente de marketing digital: barras apiladas de leads diarios por tipo de campaña (Iniciaron " +
    "chat, Formulario Landing, Formulario Meta) + una línea de CPL del tipo elegido, para el mes en " +
    "curso. Para cada tipo de campaña del array \"porTipo\" de los datos, identificá su hallazgo " +
    "propio (volumen, eficiencia, participación) y redactalo para que un cliente no técnico lo " +
    "entienda de un vistazo. Indicá además cuál de los tipos tiene mejor performance general.",
  "campaign-highlights":
    'Estás mirando el ranking de campañas individuales del calendario de inversión de un cliente ' +
    "de marketing digital (leads, CPL e inversión por campaña, dentro de cada tipo). Ya se " +
    'identificó cuál es la campaña "mejor" (mejor CPL) y cuál la "peor" (peor CPL) del mes — ' +
    "redactá el hallazgo de cada una para que un cliente no técnico lo entienda de un vistazo.",
  placements:
    'Estás mirando "Dónde se muestran los anuncios" del calendario de inversión de un cliente de ' +
    "marketing digital: leads, inversión y CPL del mes desglosados por ubicación de publicación " +
    "(Feed, Stories, Reels, video in-stream y Audience Network, incluido el formato de video " +
    "recompensado dentro de Audience Network). Este insight va ANTES del gráfico, a modo de " +
    "resumen ejecutivo de esa sección — identificá el hallazgo principal comparando la ubicación " +
    "más eficiente (menor CPL) con la menos eficiente, y si corresponde advertí sobre ubicaciones " +
    "de bajo rendimiento real (ej. Audience Network suele traer volumen de clics que no se " +
    "traduce en contactos, sobre todo en el formato de video recompensado, donde el clic ocurre " +
    "para obtener un beneficio dentro de una app y no por interés genuino en el anuncio — mencionalo " +
    "sólo si los datos de esa ubicación lo confirman). Redactalo para que un cliente no técnico lo " +
    "entienda de un vistazo.",
  audience:
    'Estás mirando "Quién responde a los anuncios" del calendario de inversión de un cliente de ' +
    "marketing digital: leads, inversión y CPL del mes desglosados por género (Mujeres/Hombres) y " +
    "rango etario (18-24, 25-34, 35-44, 45-54, 55-64, 65+), para el tipo de conversión actualmente " +
    'seleccionado ("tipoCampania" en los datos — el cliente puede cambiar este filtro, así que el ' +
    "insight debe hablar de ESTE tipo puntual, no del total general). Identificá el hallazgo " +
    "principal combinando volumen (qué segmento de género+edad trae más leads, y el split general " +
    'entre géneros en "splitGenero") y eficiencia (comparando el segmento más eficiente con el ' +
    "menos eficiente en CPL) — redactalo para que un cliente no técnico lo entienda de un vistazo.",
  regions:
    'Estás mirando "De dónde son los leads" del calendario de inversión de un cliente de marketing ' +
    "digital: inversión, leads y CPL del mes desglosados por provincia/región de Argentina, para el " +
    'tipo de conversión actualmente seleccionado ("tipoCampania" en los datos — el cliente puede ' +
    "cambiar este filtro, así que el insight debe hablar de ESTE tipo puntual, no del total " +
    "general). Identificá el hallazgo principal combinando concentración de inversión (qué " +
    'provincia absorbe la mayor parte del presupuesto, ver "mayorInversion") y eficiencia ' +
    "(comparando la provincia más eficiente con la menos eficiente en CPL) — si una provincia " +
    "concentra la mayoría de la inversión pero no es la más eficiente, señalalo como oportunidad " +
    "de reasignar presupuesto. Redactalo para que un cliente no técnico lo entienda de un vistazo.",
  "hourly-performance":
    'Estás mirando "En qué momento del día se consiguen los resultados" del calendario de ' +
    "inversión de un cliente de marketing digital: inversión y costo por contacto del mes " +
    "desglosados por hora del día (0 a 23hs, sumando todos los tipos de conversión configurados) " +
    'y agrupados en 3 franjas horarias fijas — ver el array "franjas" en los datos (horario ' +
    "comercial extendido de 09 a 20hs, noche de 21 a 23hs, y madrugada de 00 a 08hs). Identificá " +
    "el hallazgo principal comparando la eficiencia (costo por contacto) entre franjas — cuál " +
    'concentra más contactos a menor costo ("mejorFranja") y cuál es la menos eficiente ' +
    '("peorFranja") — y mencioná además la hora pico de contactos ("horaPico"). Si una franja de ' +
    "bajo tráfico (como la madrugada) tiene un costo por contacto notablemente más alto, señalalo " +
    "como oportunidad de pausar o recortar inversión en esas horas. Redactalo para que un cliente " +
    "no técnico lo entienda de un vistazo.",
  "weekday-performance":
    'Estás mirando "Qué día de la semana rinde mejor" del calendario de inversión de un cliente ' +
    "de marketing digital: inversión y costo por contacto del mes desglosados por día de la " +
    "semana (Lunes a Domingo, sumando todos los tipos de conversión configurados) y agrupados en " +
    '2 franjas fijas — ver el array "franjas" en los datos (Lunes a viernes, y Sábado y domingo). ' +
    "Identificá el hallazgo principal comparando la eficiencia (costo por contacto) entre franjas " +
    '— cuál concentra más contactos a menor costo ("mejorFranja") y cuál es la menos eficiente ' +
    '("peorFranja") — y mencioná además el día pico de contactos ("diaPico") y, si el contraste es ' +
    "notable, el día más y menos eficiente en costo por contacto. Si el fin de semana tiene un " +
    "costo por contacto notablemente más alto que los días de semana, señalalo como oportunidad de " +
    "reasignar presupuesto hacia los días más eficientes. Redactalo para que un cliente no técnico " +
    "lo entienda de un vistazo.",
  "video-retention":
    'Estás mirando "Cuánto se mira el contenido según la edad" del calendario de inversión de un ' +
    "cliente de marketing digital: el porcentaje de reproducción de los videos publicitarios del " +
    "mes, desglosado por rango etario (18-24 a 65+), medido en los hitos de avance del video (25%, " +
    "50% y 100% de la duración vista) sobre el total de inicios de reproducción " +
    '("reproduccionesTotales" en los datos — ver el array "edades" para el detalle de cada rango). ' +
    "Identificá el hallazgo principal comparando la retención entre rangos etarios — qué franja " +
    'retiene mejor la atención ("mejorRetencion") y cuál la pierde más rápido ("peorRetencion") — y ' +
    'mencioná el rango general de retención al primer cuarto del video ("retencion25Rango"). Si hay ' +
    "una diferencia marcada entre el público más joven y el mayor, señalalo como una oportunidad " +
    "para ajustar la duración o el gancho inicial del video según a quién se le muestra. Redactalo " +
    "para que un cliente no técnico lo entienda de un vistazo.",
  recommendations:
    "Estás mirando el cierre del calendario de inversión de un cliente de marketing digital: un " +
    "resumen YA CALCULADO de TODAS las secciones reales del mes (resumen general por Objetivo, " +
    'provincias, audiencia, horario, día de la semana y retención de video — ver las claves ' +
    '"porObjetivo"/"provincias"/"audiencia"/"horario"/"diaDeLaSemana"/"retencionVideo" de los ' +
    "datos, cualquiera puede faltar si esa sección no tuvo actividad este mes). Elegí entre 5 y 8 " +
    "acciones concretas de alto impacto para mejorar la performance de las campañas y los leads " +
    "del próximo período, priorizando lo que tenga mayor potencial de impacto y menor " +
    "riesgo/esfuerzo — por ejemplo reasignar presupuesto hacia lo más eficiente (horario, día, " +
    "provincia o segmento de audiencia), recortar lo menos eficiente, o ajustar la duración/gancho " +
    "de los videos si la retención es baja en algún rango etario. Redactalo para que un cliente no " +
    "técnico lo entienda de un vistazo.",
};

// Charts cuya respuesta es un hallazgo por cada tipo/segmento (ver generateChartInsightsByType),
// en vez de un único resumen combinado.
const BY_TYPE_CHARTS = new Set(["leads-by-type"]);

// Charts cuya respuesta son exactamente 2 hallazgos con rol fijo — mejor/peor — decidido de
// antemano en el código (ver generateCampaignHighlights).
const CAMPAIGN_HIGHLIGHT_CHARTS = new Set(["campaign-highlights"]);

// Charts cuya respuesta es una lista de acciones con rol fijo {accion, detalle, plazo} (ver generateRecommendations), en vez de un hallazgo de texto libre.
const RECOMMENDATION_CHARTS = new Set(["recommendations"]);

// Contenido cacheado a mano (ver lib/reports/chartInsightFallbacks.ts) que se devuelve mientras
// ANTHROPIC_PAUSED=true, en vez de pedirle un resumen nuevo a Claude. "audience" y "regions" son
// casos especiales porque su resultado depende del tipo de conversión elegido en el toggle del
// front (ver el switch más abajo), así que se resuelven aparte contra metrics.tipoCampania.
function getPausedFallback(chart: string, metrics: unknown): unknown {
  switch (chart) {
    case "investment-trend":
      return INVESTMENT_TREND_FALLBACK;
    case "leads-by-type":
      return { items: LEADS_BY_TYPE_FALLBACK };
    case "campaign-highlights":
      return { items: CAMPAIGN_HIGHLIGHTS_FALLBACK };
    case "placements":
      return PLACEMENTS_FALLBACK;
    case "regions": {
      const tipoCampania =
        typeof metrics === "object" && metrics !== null && "tipoCampania" in metrics
          ? (metrics as Record<string, unknown>).tipoCampania
          : undefined;
      const key = typeof tipoCampania === "string" ? tipoCampania : "";
      return REGIONS_FALLBACKS[key] ?? Object.values(REGIONS_FALLBACKS)[0];
    }
    case "hourly-performance":
      return HOURLY_PERFORMANCE_FALLBACK;
    case "weekday-performance":
      return WEEKDAY_PERFORMANCE_FALLBACK;
    case "video-retention":
      return VIDEO_RETENTION_FALLBACK;
    case "recommendations":
      return { items: RECOMMENDATIONS_FALLBACK };
    case "audience": {
      const tipoCampania =
        typeof metrics === "object" && metrics !== null && "tipoCampania" in metrics
          ? (metrics as Record<string, unknown>).tipoCampania
          : undefined;
      const key = typeof tipoCampania === "string" ? tipoCampania : "";
      return AUDIENCE_FALLBACKS[key] ?? Object.values(AUDIENCE_FALLBACKS)[0];
    }
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isAdminEmail(supabase, user.email))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido: se esperaba JSON." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).chart !== "string" ||
    !("metrics" in body)
  ) {
    return NextResponse.json({ error: 'Se espera { chart: string, metrics: unknown }.' }, { status: 400 });
  }

  const { chart, metrics, monthIsComplete, clientId } = body as {
    chart: string;
    metrics: unknown;
    /** true cuando el mes consultado ya terminó — sólo entonces se cachea la respuesta (ver comentario arriba). Si no viene, se asume false (no cachear) por seguridad. */
    monthIsComplete?: boolean;
    /** Opcional: sólo se usa para taggear la entrada de cache por cliente (ver lib/cache/withCache.ts) — no cambia qué se cachea ni cuándo. */
    clientId?: string;
  };
  const instructions = CHART_INSTRUCTIONS[chart];
  if (!instructions) {
    return NextResponse.json({ error: `chart desconocido: "${chart}".` }, { status: 400 });
  }

  if (isAnthropicPaused()) {
    const fallback = getPausedFallback(chart, metrics);
    if (fallback) {
      return NextResponse.json(fallback);
    }
    return NextResponse.json(
      { error: "La generación con IA está pausada y no hay contenido cacheado para este gráfico." },
      { status: 503 },
    );
  }

  const generate = async (): Promise<unknown> => {
    if (BY_TYPE_CHARTS.has(chart)) {
      return { items: await generateChartInsightsByType({ instructions, metrics }) };
    }
    if (CAMPAIGN_HIGHLIGHT_CHARTS.has(chart)) {
      return { items: await generateCampaignHighlights({ instructions, metrics }) };
    }
    if (RECOMMENDATION_CHARTS.has(chart)) {
      return { items: await generateRecommendations({ instructions, metrics }) };
    }
    return generateChartInsight({ instructions, metrics });
  };

  try {
    const result = await withCache(
      {
        clientId: clientId ?? "shared",
        source: "meta_ads",
        query: `chartInsight:${chart}`,
        params: { metrics },
        // Mes cerrado → TTL largo (el contenido no cambia más). Mes en curso → TTL fijo de 3
        // horas (antes no se cacheaba nada acá, ver comentario arriba del archivo).
        ttlSeconds: monthIsComplete ? LONG_TTL_SECONDS : THREE_HOURS_SECONDS,
      },
      generate
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al generar el resumen.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
