// Valor por defecto del bloque "Eficiencia de tokens" de Configuración v3 — se envía a Claude
// concatenado al campo `rol` (mismo mecanismo que el resto del texto de Rol), ver
// ConfiguracionV3Form.tsx.
export const DEFAULT_EFICIENCIA_TOKENS = `Lineamientos de eficiencia de tokens — Generación de informes

- Cada informe se genera desde cero. No incluyas en el contexto de la solicitud el historial de informes anteriores generados para ese cliente ni para otros. Cada llamada al modelo debe partir limpia, solo con los datos crudos necesarios para el período actual.
- No persistas conversación entre generaciones. Cada click en "Generar informe" debe ser una llamada independiente al modelo (nueva sesión/contexto), no un mensaje agregado a un hilo que va creciendo.
- Guardá el resultado, no el proceso. Lo que se persiste en base de datos es el informe final (texto/JSON ya generado), nunca el intercambio completo de mensajes, tool calls o datos crudos que se usaron para producirlo.
- Un solo informe "vivo" por cliente en memoria/caché, si aplica: si necesitás mostrar el último informe generado sin tener que regenerarlo, guardá solamente el más reciente por cliente (sobrescribiendo el anterior), no un historial acumulado. Si no hace falta mostrarlo después de generado, ni siquiera cachees eso.
- Enviá solo los datos que el informe realmente necesita, no el dataset completo de la plataforma. Filtrá y resumí (agregaciones, totales, top N) del lado del backend antes de mandarlo al modelo.
- No repitas el "Rol" o instrucciones largas del sistema en cada mensaje del mismo informe si el informe se genera en un solo llamado. Si se necesitan varios pasos, pasá el rol una sola vez por llamada, no acumulado de llamada en llamada.
- Evitá que el modelo "piense en voz alta" de más. Pedile output directo y estructurado (el hallazgo, no el razonamiento paso a paso), salvo que se necesite ese razonamiento para debug.
- No reintentes con contexto acumulado. Si un informe falla, la re-generación debe ser una llamada nueva y limpia, no un intento sobre la misma conversación que ya tiene el fallo adentro.
- Limitá el tamaño del prompt de "Rol" a lo necesario. Un rol bien escrito y conciso rinde igual que uno largo con relleno.
- No mantengas logs completos de tool calls/API responses en la tabla del informe. Si se necesita guardar algo para auditoría, guardalo aparte (tabla de logs, con rotación/expiración).
- Considerá cachear datos crudos de la plataforma (GA4/Ads/Meta) por un período corto si el usuario puede generar el informe varias veces seguidas sobre el mismo rango de fechas, para evitar reprocesar los mismos datos innecesariamente.`;
