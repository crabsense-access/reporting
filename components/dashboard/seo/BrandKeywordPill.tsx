// Badge chico para marcar una keyword de marca — se renderiza inline, al
// lado del texto de la keyword (no lo reemplaza). Verde claro con texto
// verde oscuro (bg-emerald-100, no -50, para que se distinga incluso sobre
// las filas ya resaltadas en emerald-50 del grupo del 80% en Pareto).
// Componente compartido por todas las tablas de keywords del tablero de SEO.
export function BrandKeywordPill() {
  return (
    <span className="inline-block shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium leading-none text-emerald-800">
      Marca
    </span>
  );
}
