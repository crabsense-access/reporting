<!-- Actualizado: 2026-05-25 -->
# Tipos de Schema.org: Estado y Recomendaciones (Mayo 2026)

**Versión de Schema.org:** 29.4 (8 de diciembre de 2025)

## Formato Preferido
Usa siempre **JSON-LD** (`<script type="application/ld+json">`).
La documentación de Google recomienda explícitamente JSON-LD frente a Microdata y RDFa.

**Nota sobre Búsqueda con IA:** el contenido con schema correcto tiene ~2,5x más probabilidades de aparecer en respuestas generadas por IA (confirmado por Google y Microsoft, marzo de 2025).

---

## Activos: Recomendar libremente

| Tipo | Caso de Uso | Propiedades Clave |
|------|-------------|---------------------|
| Organization | Información de empresa | name, url, logo, contactPoint, sameAs |
| LocalBusiness | Negocios físicos | name, address, telephone, openingHours, geo, priceRange |
| SoftwareApplication | Apps de escritorio/móviles | name, operatingSystem, applicationCategory, offers, aggregateRating |
| WebApplication | SaaS basado en navegador | name, applicationCategory, offers, browserRequirements, featureList |
| Product | Productos físicos/digitales | name, image, description, sku, brand, offers, review |
| Offer | Precios | price, priceCurrency, availability, url, validFrom |
| Service | Negocios de servicios | name, provider, areaServed, description, offers |
| Article | Posts de blog, noticias | headline, author, datePublished, dateModified, image, publisher |
| BlogPosting | Contenido de blog | Igual que Article + contexto específico de blog |
| NewsArticle | Contenido de noticias | Igual que Article + contexto específico de noticias |
| Review | Reseñas individuales | reviewRating, author, itemReviewed, reviewBody |
| AggregateRating | Resúmenes de valoraciones | ratingValue, reviewCount, bestRating, worstRating |
| BreadcrumbList | Navegación | itemListElement con position, name, item |
| WebSite | Nivel de sitio | name, url, potentialAction (SearchAction para búsqueda en sitelinks) |
| WebPage | Nivel de página | name, description, datePublished, dateModified |
| Person | Autor/equipo | name, jobTitle, url, sameAs, image, worksFor |
| ContactPage | Páginas de contacto | name, url |
| VideoObject | Contenido de vídeo | name, description, thumbnailUrl, uploadDate, duration, contentUrl |
| ImageObject | Contenido de imagen | contentUrl, caption, creator, copyrightHolder |
| Event | Eventos | name, startDate, endDate, location, organizer, offers |
| JobPosting | Ofertas de empleo | title, description, datePosted, hiringOrganization, jobLocation |
| Course | Contenido educativo | name, description, provider, hasCourseInstance |
| DiscussionForumPosting | Hilos de foro | headline, author, datePublished, text, url |
| ProductGroup | Productos con variantes | name, productGroupID, variesBy, hasVariant |
| ProfilePage | Perfiles de autor/creador | mainEntity (Person), name, url, description, sameAs |
| QAPage | Páginas de P&R genuinas de usuarios (una pregunta, respuestas de comunidad) | mainEntity (Question), acceptedAnswer, suggestedAnswer |

---

## Sin rich results, pero se mantiene para IA: FAQPage

| Tipo | Estado en SERP | Desde |
|------|-----------------|-------|
| FAQPage | Rich results retirados por completo — sin función SERP para ningún sitio | 7 de mayo de 2026 |

> Google retiró por completo los rich results de FAQ el **7 de mayo de 2026**. Esto **sustituye**
> a la restricción de gov/salud de agosto de 2023 — ni siquiera los sitios más autorizados obtienen ya el rich result.
> El soporte del Rich Results Test + informes se retira en junio de 2026; el soporte de la API de Search Console se elimina en agosto de 2026.
>
> **Sigue mereciendo la pena mantenerlo**: el marcado FAQPage sigue siendo una señal útil de **verificación de entidades/IA**.
> AI Mode y AI Overviews usan datos estructurados para la resolución de entidades y la verificación de afirmaciones
> durante la síntesis de respuestas, así que un FAQPage preciso puede aumentar la probabilidad de citación por IA independientemente de los rich results.
> - **FAQPage existente**: márcalo con prioridad Info, no Crítica. **No** recomiendes eliminarlo — conlleva un beneficio de citación por IA.
> - **Añadir un FAQPage nuevo**: sin beneficio en el SERP de Google; aceptable si el objetivo es visibilidad en búsqueda por IA.
> - **Páginas genuinas de una sola pregunta** donde los usuarios envían respuestas: usa **QAPage** (el tipo recomendado por Google), no FAQPage.

---

## Obsoletos: No recomendar nunca

| Tipo | Estado | Desde | Notas |
|------|--------|-------|-------|
| HowTo | Rich results eliminados por completo | Septiembre 2023 | Google dejó de mostrar rich results de how-to |
| SpecialAnnouncement | Obsoleto | 31 de julio de 2025 | Schema de la era COVID, ya no se procesa |
| CourseInfo | Retirado de rich results | Junio 2025 | Fusionado en Course |
| EstimatedSalary | Retirado de rich results | Junio 2025 | Ya no se muestra |
| LearningVideo | Retirado de rich results | Junio 2025 | Usar VideoObject en su lugar |
| ClaimReview | Retirado de rich results | Junio 2025 | El marcado de fact-check ya no genera rich results |
| VehicleListing | Retirado de rich results | Junio 2025 | Datos estructurados de listados de vehículos descontinuados |
| Book Actions | Obsoleto y luego REVERTIDO | Junio 2025 | **Sigue funcional en feb. 2026**: nota histórica únicamente |
| Practice Problem | Retirado de rich results | Finales de 2025 | Los problemas educativos de práctica ya no se muestran |
| Dataset | Retirado de rich results | Finales de 2025 | La función Dataset Search se descontinuó |

---

## Incorporaciones Recientes (2024-2026)

| Tipo/Función | Añadido | Notas |
|--------------|---------|-------|
| Marcado de Product Certification | Abril 2025 | Etiquetas energéticas, certificaciones de seguridad. Sustituyó a EnergyConsumptionDetails. |
| ProductGroup | 2025 | Variantes de producto de e-commerce con propiedades variesBy, hasVariant |
| ProfilePage | 2025 | Páginas de perfil de autor/creador con mainEntity Person para E-E-A-T |
| DiscussionForumPosting | 2024 | Para contenido de foro/comunidad |
| Speakable | Actualizado en 2024 | Para optimización de búsqueda por voz |
| LoyaltyProgram | Junio 2025 | Datos estructurados de precios para socios, tarjeta de fidelización |
| Políticas de envío/devolución a nivel de organización | Noviembre 2025 | Configurables vía Search Console sin Merchant Center |
| ConferenceEvent | Diciembre 2025 | Incorporación de Schema.org v29.4 |
| PerformingArtsEvent | Diciembre 2025 | Incorporación de Schema.org v29.4 |

## Requisitos de E-commerce (Actualizado)

| Requisito | Estado | Desde |
|-----------|--------|-------|
| `returnPolicyCountry` en MerchantReturnPolicy | **Obligatorio** | Marzo 2025 |
| Datos estructurados de variantes de producto | Ampliado | 2025, incluye moda, cosmética, electrónica |

> **Nota:** la Content API for Shopping se retira el 18 de agosto de 2026. Migra a la Merchant API.

---

## Checklist de Validación

Para cualquier bloque de schema, verifica:

1. ✅ `@context` es `"https://schema.org"` (no http)
2. ✅ `@type` es un tipo válido y no obsoleto
3. ✅ Están presentes todas las propiedades obligatorias
4. ✅ Los valores de las propiedades coinciden con los tipos de datos esperados
5. ✅ No hay texto de relleno (p. ej., "[Nombre del Negocio]")
6. ✅ Las URLs son absolutas, no relativas
7. ✅ Las fechas están en formato ISO 8601
8. ✅ Las imágenes tienen URLs válidas

## Herramientas de Testing

- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Validador de Schema.org](https://validator.schema.org/)
