// Único valor de espaciado vertical entre ítems para los 3 niveles del
// sidebar (rail de primer nivel, sub-items inline de segundo nivel, y el
// panel flotante de tercer nivel). Toda sección nueva que se agregue en el
// futuro debe importar estas constantes en vez de hardcodear su propio
// gap/margin — así hereda el mismo ritmo automáticamente y no hay que volver
// a sincronizar espaciados a mano en cada lugar.
//
// SIDEBAR_ITEM_GAP: para contenedores flex donde el espaciado se resuelve
// con `gap` (filas hermanas dentro de un mismo flex-col).
// SIDEBAR_ITEM_GAP_TOP: mismo valor que SIDEBAR_ITEM_GAP pero expresado como
// margin-top, para los casos donde el espaciado no puede resolverse con
// `gap` (ej. el primer hijo inline de un ítem de nivel 1, que vive en un
// contenedor propio distinto del de sus hermanos de nivel 1).
export const SIDEBAR_ITEM_GAP = "gap-2";
export const SIDEBAR_ITEM_GAP_TOP = "mt-2";

// Espacio entre un grupo de categoría y el siguiente dentro del panel
// flotante (nivel 3) — ej. entre el último ítem de "Composición" y el
// título de "Perfil (Google Signals)". Deliberadamente más grande que
// SIDEBAR_ITEM_GAP: separa visualmente los grupos entre sí.
export const SIDEBAR_GROUP_GAP = "gap-6";

// Espacio título→primer ítem e ítem→ítem *dentro* de un mismo grupo del
// panel flotante — más chico que SIDEBAR_ITEM_GAP a propósito, para que los
// subitems de una misma agrupación se lean juntos. No se usa en el rail
// (niveles 1 y 2), que sigue con SIDEBAR_ITEM_GAP.
export const SIDEBAR_PANEL_ITEM_GAP = "gap-1";
