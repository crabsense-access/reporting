-- ============================================================================
-- NO APLICAR TODAVÍA. Este proyecto ("reporting") comparte la base de
-- Supabase con el proyecto anterior (client-dashboards, mismo mfjcslzqdhagtlbtmlxo),
-- que todavía usa su tablero de métricas y por lo tanto sigue leyendo/
-- escribiendo dashboard_insights. Correr este drop rompería ese proyecto.
--
-- Este archivo queda documentado para el día en que este proyecto tenga su
-- propia base separada (o el proyecto anterior se dé de baja) — recién ahí
-- se puede aplicar con seguridad.
--
-- Contenido original: elimina la tabla dashboard_insights (caché de 24hs de
-- insights generados por LLM del tablero de cliente, ver lib/insights/**,
-- eliminado en este proyecto). No guarda config de conexión con fuentes de
-- datos, así que en una base propia se podría dropear entera sin problema.
-- Las policies de 0002_dashboard_insights.sql se eliminan junto con la tabla.
-- ============================================================================

drop table if exists dashboard_insights;
