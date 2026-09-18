# El Framework de Síntesis de Auditoría de 10 Principios

Esta es la metodología canónica que usa esta skill para ensamblar los
hallazgos en bruto en recomendaciones estratégicamente coherentes. Toda
auditoría completa del sitio y todo análisis profundo de página recorre
estos diez principios antes de producir el plan de acción final.

Los principios se agrupan en cuatro fases:

| Fase | Principios |
|---|---|
| **PERCIBIR** | OBSERVAR (externo) · OBSERVAR (interno) · ESCUCHAR |
| **ANALIZAR** | PENSAR · CONECTAR (lateral) · CONECTAR (sistema) |
| **VALIDAR** | SENTIR · ACEPTAR |
| **ACTUAR** | CREAR · CRECER |

Una recomendación que no ha pasado por las cuatro fases es un hallazgo,
no una recomendación.

---

## PERCIBIR

### 1. OBSERVAR — la entrada externa

Recopila señales sin interpretarlas todavía. Para la auditoría de un sitio web esto implica:

- HTML en bruto + HTML renderizado (vía `scripts/render_page.py`)
- Marcado de Schema.org realmente presente (vía `seo-schema`)
- Visibilidad en SERP para los temas publicados del sitio (vía `seo-dataforseo` /
  APIs de Google cuando estén disponibles)
- Panorama de backlinks + menciones de marca (vía `seo-backlinks`)
- Datos de campo de Core Web Vitals de CrUX (vía `scripts/pagespeed_check.py`)
- Patrones de citación en búsqueda con IA (vía `seo-geo`)
- Páginas de la competencia para las keywords principales del objetivo

**Disciplina:** no puntúes todavía. No clasifiques todavía. Solo recopila.

### 2. OBSERVAR — metacognición interna

Audita tus propias suposiciones sobre el sitio antes de ensamblar
recomendaciones. Trampas de suposición habituales en SEO:

- Asumir que la home representa al sitio (a menudo no es así —
  las páginas programáticas o de categoría suelen generar el tráfico)
- Asumir que "poco tráfico" significa "poco valor" (una consulta de bajo volumen
  pero bien ajustada a la intención puede convertir mejor que una informacional de alto volumen)
- Asumir que la marca quiere lo que el analista cree que es "buena práctica"
  (su restricción real podría ser la voz de marca, temas legales u otros
  compromisos que no ves)
- Asumir que una limitación del CMS no se puede arreglar (a menudo sí se puede)
- Asumir que un hallazgo de la v1.x sigue aplicando en la v2.x (las actualizaciones
  de Google cambian el terreno)

**Disciplina:** para cada recomendación importante, pregúntate "¿en qué
suposición se apoya esto?" Si la respuesta te sorprende, expón la suposición
en el informe para que el usuario pueda rechazarla explícitamente.

### 3. ESCUCHAR — receptividad activa

Lee lo que el sitio, la intención del usuario y las señales de la plataforma
están diciendo realmente — no lo que esperas que digan.

- Lee el copy existente de la página antes de recomendar una reescritura. La voz
  de marca es un dato.
- Lee el SERP para las keywords objetivo antes de decidir qué tipo de página
  construir. El SERP es la preferencia revelada de Google para esa intención.
- Lee reseñas de usuarios / discusiones de comunidad / hilos de Reddit para
  entender qué preguntan realmente los clientes (frente a lo que el equipo de
  marketing cree que preguntan).
- Lee las conversaciones previas del usuario + su memoria si está disponible —
  puede que ya hayan descartado ciertos enfoques.

**Disciplina:** si una recomendación contradice el SERP para la misma
intención, gana el SERP salvo que puedas explicar por qué este sitio es la
excepción.

---

## ANALIZAR

### 4. PENSAR — procesamiento crítico

Reduce los hallazgos a primeros principios:

- ¿Cuál es el **tipo de página** (informacional, transaccional, navegacional,
  local, investigación comercial) y sirve el layout actual a esa intención?
- ¿Cuál es el **umbral de elegibilidad** para las funciones de IA (indexada +
  se puede mostrar con un snippet)? Si la página no está indexada, ningún
  trabajo de IA importa todavía.
- ¿Cuál es la **restricción de mayor apalancamiento** que ata al sitio en este
  momento? (A menudo: un único defecto técnico — no indexable, LCP lento,
  canonical ausente — que condiciona todo lo demás.)
- ¿Qué dice la **guía de fuente primaria de Google** sobre la recomendación?
  Cuando las afirmaciones de la comunidad y Google se contradicen, prevalece
  Google (ver `skills/seo-geo/references/google-ai-optimization-guide.md`).

**Disciplina:** la restricción de mayor apalancamiento va primero en el plan
de acción, aunque sea menos interesante que las recomendaciones de "crecimiento".

### 5. CONECTAR — lateral / asociativo

Combina hallazgos de sub-skills que el usuario no emparejaría de forma natural.
Ejemplos que a menudo producen las recomendaciones de mayor valor:

- Hallazgo de contenido escaso de `seo-content` × datos de solapamiento de SERP
  de `seo-cluster` → consolidar tres páginas débiles en un hub de cluster.
- Schema de Product ausente de `seo-schema` × UCP no declarado de
  `seo-ecommerce` → ambos cierran la misma brecha de compra en la era de
  agentes; agrúpalos en una única recomendación.
- Baja tasa de citación en IA de `seo-geo` × menciones de marca insuficientes
  de `seo-backlinks` → las menciones importan 3 veces más que los backlinks
  para las citaciones de IA; redirige el presupuesto de link building hacia
  PR / Reddit / YouTube.
- Detección de SPA de `seo-technical` × contenido principal ausente de
  `seo-content` → el contenido bloqueado por JS es la causa raíz del
  hallazgo de contenido.

**Disciplina:** cualquier hallazgo aislado de una sub-skill que sobreviva sin
cambios a la conexión debería generar sospecha — podría ser un síntoma, no una causa.

### 6. CONECTAR — orquestación de sistema

Enlaza las recomendaciones validadas en una secuencia ejecutable:

- ¿Qué recomendación **desbloquea** a más otras? Hazla primero.
- ¿Qué recomendaciones **dependen** unas de otras? Secuéncialas.
- ¿Qué recomendaciones se pueden **paralelizar**? Muéstraselo al usuario
  para que pueda repartirlas.
- ¿Qué recomendaciones necesitan una **herramienta que aún no está instalada**
  (p. ej. Firecrawl para el rastreo del sitio, DataForSEO para datos de SERP)?
  Marca esa carencia.

**Disciplina:** el plan de acción es un grafo de dependencias, no una lista.
Si dos recomendaciones no se pueden hacer en ningún orden concreto, dilo.

---

## VALIDAR

### 7. SENTIR — inteligencia emocional + intuición

Las recomendaciones de pura lógica se rompen al contacto con el lector /
negocio / stakeholder real. Ponlas a prueba frente a:

- **Experiencia de usuario.** ¿Empeoraría la recomendación la página para
  un lector humano? (Fallo habitual: saturar con schema FAQ un sitio para
  el que Google ni siquiera muestra rich results.)
- **Voz de marca.** ¿Entraría en conflicto la recomendación con el tono
  existente del sitio? (Fallo habitual: recomendar reescrituras
  "respuesta-primero" a una marca de lujo que usa el suspense como recurso de UX.)
- **Capacidad del equipo.** ¿Es realista para el equipo que tiene que
  ejecutarlo? (Fallo habitual: recomendar 30 páginas de ubicación nuevas
  a una agencia de 2 personas.)
- **Intuición forjada con experiencia.** Cuando los datos son ambiguos,
  confía en el reconocimiento de patrones de sitios anteriores del mismo vertical.

**Disciplina:** si no puedes articular el coste humano de una
recomendación, no la has validado del todo.

### 8. ACEPTAR — humildad intelectual

Cada recomendación debe llevar la falsabilidad propia de la honestidad:

- Si la hipótesis detrás de la recomendación es errónea, ¿qué lo demostraría?
  (Define una comprobación medible.)
- Si el usuario ya probó esto y no funcionó antes, exponlo. No vuelvas a
  recomendar lo mismo.
- Si una restricción no se puede eliminar (legal, de marca, técnica), la
  recomendación tiene que pivotar — no insistir.
- Si una recomendación de la v1 ha quedado obsoleta porque la guía de Google
  cambió, retráctate explícitamente.

**Disciplina:** cada recomendación lleva una línea de "¿cómo sabríamos que
esto ha fallado?" Nada de apuestas invisibles.

---

## ACTUAR

### 9. CREAR — resultado generativo

Deja de estrategizar. Produce el artefacto:

- Un informe en markdown con acciones priorizadas, dependencias y
  resultados medibles.
- JSON-LD de schema generado, listo para pegar en el sitio.
- Un brief de contenido con keywords objetivo, esquema y enlaces internos.
- Un PDF vía `scripts/google_report.py` cuando el usuario lo pida.
- La implementación más pequeña de la recomendación de mayor apalancamiento,
  no el plan completo.

**Disciplina:** entrega el artefacto. La parálisis por análisis es el enemigo.

### 10. CRECER — bucle iterativo

La auditoría es una instantánea, no un veredicto. Construye el bucle de
retroalimentación:

- Captura una línea base con `/seo drift baseline <url>` para que las
  auditorías posteriores puedan demostrar qué ha cambiado.
- Define uno o dos indicadores adelantados que el usuario debería
  monitorizar (tendencia de CrUX, impresiones en GSC para un cluster
  objetivo, crecimiento de menciones de marca en Reddit / YouTube).
- Programa una cadencia de reauditoría adecuada a la velocidad del sitio
  (semanal para un e-commerce de alta rotación; trimestral para un SaaS B2B).
- Expón lo que esta skill **no ha podido medir** (conversión offline, brand
  lift, entrevistas a clientes) para que la persona cierre esos bucles.

**Disciplina:** el último párrafo de toda auditoría nombra qué debería
buscar la próxima auditoría.

---

## Cómo invocar el framework

Toda auditoría completa del sitio (`/seo audit`) y auditoría profunda de página
(`/seo page`) recorre PERCIBIR → ANALIZAR → VALIDAR → ACTUAR antes de emitir
el plan de acción. La clasificación en Crítico / Alto / Medio / Bajo ocurre
**después** de la fase de validación, no en su lugar.

Los comandos de propósito único (`/seo schema`, `/seo images`, `/seo technical`,
etc.) pueden saltarse el bucle completo cuando el usuario hace una pregunta
concreta — pero sus recomendaciones deben pasar al menos por PENSAR + ACEPTAR
antes de emitirse (¿se apoya en un primer principio sólido, y se expone la
falsabilidad?).

## Cuándo escalar al usuario

Estos principios son de esta skill; no son del usuario. Expónselos al
usuario cuando:

- Una recomendación requiere aceptar una suposición que preferirías no
  asumir tú (CONECTAR-lateral suele producir estas — muestra el vínculo y
  deja que el usuario lo confirme).
- La fase de validación marcó una restricción de voz de marca / capacidad
  del equipo / restricción dura que puedes ver pero no resolver.
- La auditoría no encontró ninguna restricción raíz y está recomendando
  una optimización que podría ser prematura.
