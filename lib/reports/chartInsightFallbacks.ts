import type { ChartInsight, ChartInsightByType, CampaignHighlight, Recommendation } from "@/lib/reports/chartInsights";

// Contenido cacheado a mano: la última respuesta real que generó Claude para cada gráfico del
// calendario de inversión (ver components/admin/reporting/*), capturada el 18/9/2026 con los
// datos de prueba de Axesa. Se usa como fallback en app/api/reporting/chart-insights/route.ts
// mientras ANTHROPIC_PAUSED=true (ver isAnthropicPaused en lib/anthropic/client.ts), para no
// pegarle a la API sin cortar la experiencia del dashboard. Como los datos de prueba cambian
// día a día (son determinísticos por fecha, ver lib/reporting/mockInvestmentCalendar.ts), este
// texto va a quedar desactualizado con el correr de los días — es esperable mientras dure la
// pausa; al reactivar la IA vuelve a generarse fresco en cada carga.

export const INVESTMENT_TREND_FALLBACK: ChartInsight = {
  headline: "El 5 de septiembre concentró inversión y leads",
  body: "El día de mayor inversión del mes fue también el de mayor volumen de contactos, lo que muestra que el aumento de presupuesto se tradujo en resultados. La eficiencia se mantuvo estable en el resto del período, con el mejor costo por lead el 8 de septiembre y el más alto el 10, una variación normal dentro del mes.",
  highlights: [
    { label: "Inversión total", value: "US$ 2.730" },
    { label: "Leads totales", value: "361" },
    { label: "Pico 5 sep", value: "US$ 237 / 34 leads" },
    { label: "CPL promedio", value: "US$ 7,76" },
  ],
};

export const LEADS_BY_TYPE_FALLBACK: ChartInsightByType[] = [
  {
    tipo: "Iniciaron chat",
    headline: "Concentra más de la mitad de leads",
    body: "Es el canal que más contactos genera en el mes y sostiene el volumen general de la cuenta, con un costo por lead muy cercano al más eficiente.",
    highlights: [
      { label: "Leads del mes", value: "184" },
      { label: "Participación", value: "51%" },
      { label: "CPL", value: "US$ 7,44" },
    ],
    esMejor: true,
  },
  {
    tipo: "Formulario Landing",
    headline: "El costo por lead más bajo",
    body: "Logra la mejor eficiencia del período con un volumen intermedio, por lo que aparece como el canal con mayor margen para escalar inversión.",
    highlights: [
      { label: "Leads del mes", value: "93" },
      { label: "Participación", value: "26%" },
      { label: "CPL", value: "US$ 7,38" },
    ],
    esMejor: false,
  },
  {
    tipo: "Formulario Meta",
    headline: "Menor volumen y CPL más alto",
    body: "Es el canal con la participación más baja y el costo por contacto más elevado, lo que sugiere revisar segmentación y creatividades antes de sumar presupuesto.",
    highlights: [
      { label: "Leads del mes", value: "84" },
      { label: "Participación", value: "23%" },
      { label: "CPL", value: "US$ 8,04" },
    ],
    esMejor: false,
  },
];

export const CAMPAIGN_HIGHLIGHTS_FALLBACK: CampaignHighlight[] = [
  {
    rol: "mejor",
    nombre: "Landing · Búsqueda Marca",
    headline: "Búsqueda de marca lidera el mes",
    body: "La campaña de marca es la más eficiente del calendario: capta la demanda de usuarios que ya buscan al cliente, y con la menor inversión del par logra el mayor volumen de leads.",
    highlights: [
      { label: "CPL", value: "US$ 6,29" },
      { label: "Leads", value: "86" },
      { label: "Inversión", value: "US$ 541" },
    ],
  },
  {
    rol: "peor",
    nombre: "Landing · Búsqueda Genérica",
    headline: "Genérica: oportunidad de optimizar costos",
    body: "Al apuntar a búsquedas más amplias y competidas, esta campaña necesita más presupuesto para conseguir menos leads que la de marca; hoy está pausada, así que es el momento ideal para depurar keywords y ajustar la landing antes de reactivarla.",
    highlights: [
      { label: "CPL", value: "US$ 9,78" },
      { label: "Leads", value: "65" },
      { label: "Inversión", value: "US$ 636" },
    ],
  },
];

// "De dónde son los leads" varía según el tipo de conversión elegido en el toggle del front (ver
// components/admin/reporting/RegionAnalysis.tsx) — mismo criterio que AUDIENCE_FALLBACKS: una
// entrada por tipo, indexada por el mismo "tipoCampania" que viaja en los metrics (el label tal
// cual está cargado en el Admin, con su typo incluido: "Fomulario Meta"). Capturado el 18/9/2026
// con datos reales de Axesa — sólo hay variante para "Fomulario Meta" por ahora (el único tipo con
// datos confirmados); getPausedFallback cae a esa por defecto para cualquier otro tipo hasta que
// se sume su propia variante.
export const REGIONS_FALLBACKS: Record<string, ChartInsight> = {
  "Fomulario Meta": {
    headline: "Buenos Aires concentra la inversión, pero Mendoza es más eficiente",
    body: "En Fomulario Meta, Buenos Aires y Mendoza son las únicas provincias con actividad este mes, con un lead cada una. Buenos Aires absorbe más de la mitad del presupuesto pero con un costo por lead más alto; Mendoza logra el mismo resultado invirtiendo menos, lo que la posiciona como la provincia más eficiente del mes en este tipo de conversión.",
    highlights: [
      { label: "Mayor inversión", value: "Buenos Aires (58,9%)" },
      { label: "Provincia más eficiente", value: "Mendoza — US$ 39,13" },
      { label: "Provincia menos eficiente", value: "Buenos Aires — US$ 55,99" },
      { label: "CPL promedio", value: "US$ 47,56" },
    ],
  },
};

// "En qué momento del día se consiguen los resultados" — todavía no hay una corrida real de
// Claude para este gráfico (es nuevo), así que este fallback está armado a mano con números
// inventados pero realistas, en el mismo formato que va a devolver la franja horaria real (ver
// components/admin/reporting/HourlyPerformanceChart.tsx). Reemplazar por la primera respuesta real
// de Claude cuando se reactive la IA.
export const HOURLY_PERFORMANCE_FALLBACK: ChartInsight = {
  headline: "La franja de 09:00 a 20:00 concentra el 75% de los contactos a un costo 45% menor",
  body: "La franja de 09:00 a 20:00 concentra el 75% de los contactos a un costo un 45% inferior al del resto del día. Las mejores horas para formularios son las 10:00 y las 11:00, con 46 y 48 leads respectivamente; las conversaciones por mensaje alcanzan su pico a las 15:00. La madrugada consume el 23% del presupuesto y aporta apenas el 14% de los contactos, por lo que es la franja con más margen para recortar inversión sin perder volumen.",
  highlights: [
    { label: "Costo/contacto 09-20h", value: "$2,40" },
    { label: "Costo/contacto 21-23h", value: "$4,02" },
    { label: "Costo/contacto 00-08h", value: "$4,71" },
    { label: "Mejor hora", value: "10:00 y 11:00hs" },
  ],
};

// Mismo criterio que HOURLY_PERFORMANCE_FALLBACK de arriba: gráfico nuevo, todavía sin respuesta
// real de Claude (ANTHROPIC_PAUSED=true), así que este fallback está armado a mano con números
// inventados pero realistas — de la misma forma en que va a llegar el resumen real (ver
// components/admin/reporting/WeekdayPerformanceChart.tsx). Reemplazar por la primera respuesta
// real de Claude cuando se reactive la IA.
export const WEEKDAY_PERFORMANCE_FALLBACK: ChartInsight = {
  headline: "Los días de semana rinden un 24% mejor que el fin de semana",
  body: "De lunes a viernes se concentra el 82% de la inversión y el 85% de los contactos del mes, con un costo por contacto un 24% más bajo que el fin de semana. El jueves es el día más fuerte, con 48 contactos — el pico del mes — mientras que el domingo es el menos eficiente: aporta apenas el 4% de los contactos pero con el costo por contacto más alto de la semana. Vale la pena evaluar recortar parte de la inversión de fin de semana y reforzar los días de semana, sobre todo martes y jueves.",
  highlights: [
    { label: "Costo/contacto Lun-Vie", value: "$2,68" },
    { label: "Costo/contacto Sáb-Dom", value: "$3,52" },
    { label: "Mejor día", value: "Jueves" },
    { label: "Día menos eficiente", value: "Domingo" },
  ],
};

// A diferencia de los fallbacks de arriba, estos números no son inventados: son los que Martín
// compartió como referencia al pedir este gráfico (ver components/admin/reporting/
// VideoRetentionChart.tsx), así que se usan tal cual en vez de estimarlos. Igual hay que
// reemplazar esto por la respuesta real de Claude apenas se reactive la IA (ANTHROPIC_PAUSED).
export const VIDEO_RETENTION_FALLBACK: ChartInsight = {
  headline: "La atención aumenta de forma sostenida con la edad",
  body: "El público mayor de 55 años tiene casi el doble de probabilidad de superar el primer cuarto del video que el de 25 a 44. Este patrón coincide con el de conversiones: los segmentos que más miran son también los que más contactan. La retención general, de entre 9% y 17% al primer cuarto, indica que los ganchos iniciales tienen margen de mejora.",
  highlights: [
    { label: "Reproducciones totales", value: "586.000" },
    { label: "Retención al 25% (rango)", value: "8,9% – 16,7%" },
    { label: "Mejor retención", value: "65+ (16,7%)" },
    { label: "Menor retención", value: "25-34 y 35-44 (8,9%)" },
  ],
};

// A diferencia de los demás fallbacks (uno por gráfico puntual), esto es el cierre de TODA la
// página — ver components/admin/reporting/RecommendationsPanel.tsx. Son acciones genéricas de
// buenas prácticas de Meta Ads, cada una atada a una sección real que ya está conectada en el
// Calendario (horario, día de la semana, provincias, audiencia, retención de video), en vez de
// nombrar campañas puntuales inventadas — reemplazar por la primera respuesta real de Claude
// (que sí va a citar cifras y nombres reales de la cuenta) apenas se reactive la IA.
export const RECOMMENDATIONS_FALLBACK: Recommendation[] = [
  {
    accion: "Reforzar presupuesto en el horario de mayor eficiencia",
    detalle:
      "La franja de 09:00 a 20:00 suele concentrar la mayoría de los contactos del mes a un costo por contacto notablemente menor que la madrugada — mover presupuesto hacia esas horas puede bajar el costo por contacto general sin resignar volumen.",
    plazo: "Inmediato",
  },
  {
    accion: "Priorizar los días de semana sobre el fin de semana",
    detalle:
      "De lunes a viernes el costo por contacto suele ser más bajo que sábado y domingo — reasignar parte del presupuesto de fin de semana hacia los días de semana es una mejora de bajo riesgo.",
    plazo: "Corto plazo",
  },
  {
    accion: "Redirigir inversión hacia la provincia más eficiente",
    detalle:
      "Cuando una provincia concentra gran parte del presupuesto pero no es la más eficiente en costo por lead, mover parte de esa inversión hacia la provincia con mejor CPL puede mejorar el rendimiento general sin aumentar el gasto.",
    plazo: "Corto plazo",
  },
  {
    accion: "Ajustar el gancho inicial de los videos para el público más joven",
    detalle:
      "Cuando el público de 25 a 44 años retiene menos el video que el de 55+, vale la pena probar una intro más corta o un gancho distinto para esos rangos etarios, ya que suelen abandonar el video en los primeros segundos.",
    plazo: "Próximo mes",
  },
  {
    accion: "Revisar el Objetivo con mayor costo por contacto",
    detalle:
      "El Objetivo con el CPL más alto del mes es el que más margen tiene para optimizar — revisar su segmentación, creatividades y destino (formulario o WhatsApp) antes de seguir escalando su presupuesto.",
    plazo: "Corto plazo",
  },
  {
    accion: "Consolidar presupuesto en el segmento de audiencia más eficiente",
    detalle:
      "El segmento de género y edad con mejor costo por contacto suele tener margen para absorber más presupuesto sin perder eficiencia — ampliar su participación es una forma directa de bajar el CPL promedio de la cuenta.",
    plazo: "Próximo mes",
  },
];

export const PLACEMENTS_FALLBACK: ChartInsight = {
  headline: "Facebook Reels rinde 7 veces mejor que Audience Network",
  body: "Las ubicaciones propias de Facebook e Instagram (Reels, Feed y Stories) concentran los contactos más baratos, mientras que Audience Network —en especial el video recompensado— genera el mayor volumen de clics del mes pero casi no los convierte en leads: ahí el clic ocurre para desbloquear un beneficio dentro de una app, no por interés real en el anuncio. Recomendamos excluir esa ubicación y redirigir ese presupuesto a Reels y Feed.",
  highlights: [
    { label: "CPL Facebook Reels", value: "US$ 4,18" },
    { label: "CPL video recompensado", value: "US$ 28,67" },
    { label: "CPL promedio", value: "US$ 7,89" },
    { label: "Inversión Audience Network", value: "US$ 728" },
  ],
};

// "Quién responde a los anuncios" varía según el tipo de conversión elegido en el toggle del
// front (ver components/admin/reporting/AudienceAnalysis.tsx) — el fallback tiene que elegir la
// misma variante que el usuario tiene seleccionada, así que va una entrada por tipo, indexada por
// el mismo "tipoCampania" que ya viaja en los metrics (LEAD_TYPE_LABEL).
export const AUDIENCE_FALLBACKS: Record<string, ChartInsight> = {
  "Iniciaron chat": {
    headline: "Mujeres de 45+ dominan los chats iniciados",
    body: "En las campañas de Iniciaron chat, el público femenino mayor de 45 años concentra la mayor parte del volumen y además consigue el costo por lead más bajo de la tabla. En el extremo opuesto, los hombres más jóvenes cuestan casi cuatro veces más por cada chat, por lo que conviene reasignar presupuesto hacia los segmentos que ya están rindiendo.",
    highlights: [
      { label: "Mayor volumen", value: "Mujeres 45-54: 49 leads" },
      { label: "CPL más bajo", value: "Mujeres 55-64: US$ 4,60" },
      { label: "CPL más alto", value: "Hombres 18-24: US$ 17,83" },
      { label: "Participación mujeres", value: "56,1%" },
    ],
  },
  "Formulario Landing": {
    headline: "Mujeres 45+ concentran volumen y mejor eficiencia",
    body: "En Formulario Landing, las mujeres de 45 en adelante son el motor del mes: aportan la mayor cantidad de leads y los costos por lead más bajos, bastante por debajo del promedio del período. En el otro extremo, los hombres más jóvenes son el segmento más caro y con volumen casi nulo, por lo que conviene reasignar ese presupuesto hacia los rangos que ya están rindiendo.",
    highlights: [
      { label: "Leads totales", value: "151" },
      { label: "Split mujeres", value: "63,6%" },
      { label: "Mejor CPL (Mujeres 55-64)", value: "US$ 5,16" },
      { label: "Peor CPL (Hombres 18-24)", value: "US$ 15,00" },
    ],
  },
  "Formulario Meta": {
    headline: "Mujeres 45-54 lideran volumen y eficiencia",
    body: "En Formulario Meta la respuesta se concentra en mujeres de 45 a 64 años, que combinan el mayor volumen de leads con los costos por lead más bajos del mes. En el otro extremo, el público joven masculino cuesta más del triple que el segmento más eficiente, por lo que conviene reasignar ese presupuesto hacia las franjas de 45+.",
    highlights: [
      { label: "Leads totales", value: "138" },
      { label: "Top volumen", value: "21" },
      { label: "CPL más bajo", value: "US$ 4,86" },
      { label: "CPL más alto", value: "US$ 17,33" },
    ],
  },
};
