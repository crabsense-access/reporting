import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { generateReport } from "@/lib/reports/generate";
import type { ReportProgressEvent } from "@/lib/reports/generate";
import type { PlatformObjective } from "@/lib/reports/buildPromptMessage";
import { isReportPlatform, type ReportPlatform } from "@/lib/reports/platforms";

interface GenerateReportBody {
  rol?: unknown;
  selectedPlatforms?: unknown;
  objetivos?: unknown;
  periodoInstrucciones?: unknown;
  reglaPrincipal?: unknown;
  formatoEntregable?: unknown;
  estructuraFinal?: unknown;
  metricasInsights?: unknown;
  formatoInsight?: unknown;
  priorizacion?: unknown;
  reglas?: unknown;
  top10Acciones?: unknown;
  principioFinal?: unknown;
  dateRangeStart?: unknown;
  dateRangeEnd?: unknown;
}

function parseObjetivos(raw: unknown): Partial<Record<ReportPlatform, PlatformObjective>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const result: Partial<Record<ReportPlatform, PlatformObjective>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isReportPlatform(key)) continue;
    if (typeof value !== "object" || value === null) continue;
    const { principal, secundario } = value as Record<string, unknown>;
    result[key] = {
      principal: typeof principal === "string" ? principal : "",
      secundario: typeof secundario === "string" ? secundario : "",
    };
  }
  return result;
}

function parseMetricasInsights(raw: unknown): Partial<Record<ReportPlatform, string>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const result: Partial<Record<ReportPlatform, string>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isReportPlatform(key)) continue;
    result[key] = typeof value === "string" ? value : "";
  }
  return result;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: admin } = user?.email
    ? await supabase.from("admins").select("id").eq("email", user.email).maybeSingle()
    : { data: null };

  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  }

  let body: GenerateReportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido, se esperaba JSON." }, { status: 400 });
  }

  const {
    rol,
    selectedPlatforms,
    objetivos,
    periodoInstrucciones,
    reglaPrincipal,
    formatoEntregable,
    estructuraFinal,
    metricasInsights,
    formatoInsight,
    priorizacion,
    reglas,
    top10Acciones,
    principioFinal,
    dateRangeStart,
    dateRangeEnd,
  } = body;

  if (typeof rol !== "string" || rol.trim().length === 0) {
    return NextResponse.json({ error: "rol es obligatorio." }, { status: 400 });
  }
  if (
    !Array.isArray(selectedPlatforms) ||
    selectedPlatforms.length === 0 ||
    !selectedPlatforms.every((platform): platform is string => typeof platform === "string" && isReportPlatform(platform))
  ) {
    return NextResponse.json(
      { error: "selectedPlatforms es obligatorio y tiene que tener al menos una plataforma válida." },
      { status: 400 }
    );
  }
  if (typeof dateRangeStart !== "string" || typeof dateRangeEnd !== "string") {
    return NextResponse.json(
      { error: "dateRangeStart y dateRangeEnd son obligatorios (formato YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  const platforms = selectedPlatforms as ReportPlatform[];
  const parsedObjetivos = parseObjetivos(objetivos);
  const parsedPeriodoInstrucciones = typeof periodoInstrucciones === "string" ? periodoInstrucciones : "";
  const parsedReglaPrincipal = typeof reglaPrincipal === "string" ? reglaPrincipal : "";
  const parsedFormatoEntregable = typeof formatoEntregable === "string" ? formatoEntregable : "";
  const parsedEstructuraFinal = typeof estructuraFinal === "string" ? estructuraFinal : "";
  const parsedMetricasInsights = parseMetricasInsights(metricasInsights);
  const parsedFormatoInsight = typeof formatoInsight === "string" ? formatoInsight : "";
  const parsedPriorizacion = typeof priorizacion === "string" ? priorizacion : "";
  const parsedReglas = typeof reglas === "string" ? reglas : "";
  const parsedTop10Acciones = typeof top10Acciones === "string" ? top10Acciones : "";
  const parsedPrincipioFinal = typeof principioFinal === "string" ? principioFinal : "";

  // Stream NDJSON (una línea JSON.stringify por evento) en la misma request, en vez de
  // devolver un solo JSON al final — el frontend lee el progreso real del loop de tool calling
  // a medida que ocurre, sin polling ni un endpoint de status separado.
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: ReportProgressEvent) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }

      try {
        await generateReport(
          {
            supabase,
            clientId,
            clientName: client.name,
            rol,
            selectedPlatforms: platforms,
            objetivos: parsedObjetivos,
            periodoInstrucciones: parsedPeriodoInstrucciones,
            reglaPrincipal: parsedReglaPrincipal,
            formatoEntregable: parsedFormatoEntregable,
            estructuraFinal: parsedEstructuraFinal,
            metricasInsights: parsedMetricasInsights,
            formatoInsight: parsedFormatoInsight,
            priorizacion: parsedPriorizacion,
            reglas: parsedReglas,
            top10Acciones: parsedTop10Acciones,
            principioFinal: parsedPrincipioFinal,
            dateRangeStart,
            dateRangeEnd,
            createdBy: admin.id,
          },
          emit
        );
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : "Error desconocido." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
