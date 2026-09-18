# Metodología de Puntuación de Calidad de Backlinks

## Indicadores de Enlaces Tóxicos (30 Patrones)

### Spam Claro (marcar automáticamente)
1. Enlace desde un dominio con 10.000+ enlaces salientes por página
2. Enlace desde un dominio sin páginas indexadas en Google
3. Enlace desde un dominio registrado hace <30 días con 100+ enlaces salientes
4. Anchor text de keyword exacta desde 5+ dominios no relacionados
5. Enlaces desde páginas puerta (contenido escaso, saturado de keywords)
6. Enlaces desde sitios hackeados (inyecciones de farmacia/casino)
7. Enlaces desde redes de enlaces conocidas (comprobar contra listas de PBN conocidas)
8. Enlaces en footer/sidebar presentes en todo el sitio desde dominios no relacionados
9. Enlaces desde contenido autogenerado (artículos "spineados")
10. Enlaces desde dominios con penalizaciones manuales de Google

### Probable Spam (revisión manual)
11. Enlaces desde dominios con >90% de ratio de enlaces salientes
12. Dominios en otro idioma enlazando a contenido en español (y viceversa)
13. Enlaces desde dominios caducados/subastados reutilizados para link building
14. Enlaces desde páginas con >50 enlaces salientes
15. Enlaces desde sitios sin tráfico real (dominios aparcados)
16. Patrones de enlaces recíprocos entre 10+ dominios
17. Enlaces desde propiedades Web 2.0 con contenido escaso
18. Enlaces desde directorios de artículos (EzineArticles, ArticleBase)
19. Enlaces desde redes de guest posting de baja calidad
20. Enlaces desde nichos no relacionados (p. ej., un sitio de mascotas enlazando a un SaaS)

### Potencialmente Problemático (monitorizar)
21. Enlaces desde sitios de marcadores sociales a gran escala
22. Enlaces desde perfiles de foro (no de discusiones)
23. Enlaces desde redes de sindicación de notas de prensa
24. Enlaces desde agregadores de cupones/ofertas
25. Enlaces desde directorios genéricos (no específicos del sector)
26. Enlaces con anchor text oculto/invisible
27. Enlaces desde páginas con contenido cloaked
28. Enlaces desde sitios con contenido de afiliación escaso
29. Enlaces desde secciones de comentarios sin contexto editorial
30. Enlaces desde dominios exclusivamente nofollow (valor SEO limitado)

## Benchmarks de Ratio de Anchor Text por Sector

| Sector | De Marca | URL | Genérico | Keyword Exacta | Keyword Parcial |
|--------|----------|-----|----------|------------------|--------------------|
| SaaS | 40-55% | 15-20% | 10-15% | 3-8% | 10-15% |
| E-commerce | 35-45% | 15-25% | 10-15% | 5-10% | 10-20% |
| Servicio Local | 45-60% | 10-15% | 15-20% | 5-10% | 5-10% |
| Medios/Blog | 30-40% | 20-30% | 10-15% | 3-8% | 10-20% |
| Agencia | 40-50% | 15-20% | 10-15% | 5-10% | 10-15% |

## Señales de Alerta en la Velocidad de Enlaces

| Patrón | Señal | Acción |
|--------|-------|--------|
| 10 veces más enlaces nuevos de lo normal en 1 semana | Posible SEO negativo | Investigar el origen, preparar disavow |
| 50%+ de enlaces perdidos en 1 mes | Penalización o problemas del sitio | Comprobar acciones manuales en GSC |
| Cero enlaces nuevos durante 3+ meses | El contenido no atrae enlaces | Revisar la estrategia de contenido |
| Todos los enlaces nuevos del mismo TLD | Link building coordinado | Diversificar fuentes |
| Pico desde un único país | Actividad de red de enlaces | Revisar fuentes geográficas |

## Recomendaciones de Disavow

**Cuándo hacer disavow:**
- El dominio ha recibido una penalización manual de Google
- Evidencia clara de un ataque de SEO negativo
- El ratio de enlaces tóxicos supera el 10% del perfil total
- Dominios específicos identificados como PBN o granjas de enlaces

**Cuándo NO hacer disavow:**
- Enlaces de baja calidad que Google probablemente ya ignora
- Enlaces nofollow (ya devaluados por Google)
- Enlaces de sitios legítimos pero de baja autoridad
- Un número reducido de enlaces spam (<2% del perfil)

**Formato del archivo de disavow:**
```
# Dominios tóxicos identificados por el análisis de backlinks de Palo Seco SEO
# Fecha: AAAA-MM-DD
# Total de dominios en disavow: X
domain:spamsite1.com
domain:linkfarm2.net
domain:pbn-network3.xyz
```
