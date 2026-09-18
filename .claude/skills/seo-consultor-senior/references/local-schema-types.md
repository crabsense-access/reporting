<!-- Actualizado: 2026-03-23 -->
# Tipos de Schema Local y Patrones Específicos por Sector (Marzo 2026)

El schema NO es un factor de ranking directo (Confirmado: John Mueller, Gary Illyes). Impacta indirectamente en la visibilidad a través de los rich results (aumento del 43% en CTR, caso de estudio de Webstix), una mejor comprensión de entidades y las funciones de búsqueda con IA.

---

## Subtipos de LocalBusiness Soportados por Google

### Alimentación y Restauración

| Tipo de Schema | Usar Para |
|------------------|------------|
| `Restaurant` | Restaurantes con servicio completo |
| `CafeOrCoffeeShop` | Cafeterías |
| `BarOrPub` | Bares, pubs, tabernas |
| `Bakery` | Panaderías |
| `FastFoodRestaurant` | Comida rápida, servicio express |
| `IceCreamShop` | Heladerías, yogur helado |
| `FoodEstablishment` | Genérico de alimentación (evitar si existe un subtipo específico) |

### Sanidad

| Tipo de Schema | Usar Para |
|------------------|------------|
| `MedicalClinic` | Clínicas, urgencias (elegible para rich results) |
| `Hospital` | Hospitales (elegible para rich results) |
| `Dentist` | Clínicas dentales (elegible para rich results) |
| `Physician` | Páginas de médicos individuales (usar con Person) |
| `Optician` | Ópticas |
| `Pharmacy` | Farmacias |
| `MedicalBusiness` | Genérico médico (evitar si existe un subtipo específico) |

### Legal

| Tipo de Schema | Usar Para | Notas |
|------------------|------------|-------|
| `LegalService` | Despachos y bufetes | **Tipo correcto** |
| ~~`Attorney`~~ | ~~Abogados individuales~~ | **OBSOLETO según Schema.org. Usar `LegalService` + `Person`** |

### Servicios para el Hogar

| Tipo de Schema | Usar Para |
|------------------|------------|
| `Plumber` | Servicios de fontanería |
| `Electrician` | Servicios eléctricos |
| `HVACBusiness` | Calefacción, ventilación, AC |
| `RoofingContractor` | Tejados |
| `GeneralContractor` | Contratista general |
| `HousePainter` | Servicios de pintura |
| `Locksmith` | Cerrajería |
| `MovingCompany` | Empresas de mudanzas |
| `HomeAndConstructionBusiness` | Genérico (evitar si existe un subtipo específico) |

### Inmobiliaria

| Tipo de Schema | Usar Para | Notas |
|------------------|------------|-------|
| `RealEstateAgent` | Tanto agentes como inmobiliarias | No existe el tipo `RealEstateBrokerage` |

### Automoción

| Tipo de Schema | Usar Para |
|------------------|------------|
| `AutoDealer` | Departamentos de venta |
| `AutoRepair` | Departamentos de taller |
| `AutoPartsStore` | Departamentos de recambios |

### Otros Tipos Locales Comunes

`AnimalShelter`, `BeautySalon`, `ChildCare`, `DaySpa`, `DryCleaningOrLaundry`, `EmergencyService`, `EmploymentAgency`, `EntertainmentBusiness`, `FinancialService`, `FireStation`, `FurnitureStore`, `GasStation`, `GolfCourse`, `GovernmentOffice`, `HealthClub`, `Hotel`, `InsuranceAgency`, `Library`, `LodgingBusiness`, `NightClub`, `PetStore`, `PoliceStation`, `PostOffice`, `RecyclingCenter`, `ShoppingCenter`, `SkiResort`, `SportsActivityLocation`, `Store`, `TouristInformationCenter`, `TravelAgency`, `VeterinaryCare`

---

## Propiedades Obligatorias vs. Recomendadas

Según la documentación de Google Developers (actualizada el 10 de diciembre de 2025, Confirmado).

### Obligatorias (Mínimo)

| Propiedad | Tipo | Notas |
|-----------|------|-------|
| `name` | Text | Nombre del negocio, debe coincidir exactamente con GBP |
| `address` | PostalAddress | Con streetAddress, addressLocality, addressRegion, postalCode |

### Recomendadas

| Propiedad | Tipo | Notas |
|-----------|------|-------|
| `aggregateRating` | AggregateRating | Resumen de valoración con reviewCount |
| `geo` | GeoCoordinates | **Mínimo 5 decimales** (Confirmado, ~1,1m de precisión) |
| `openingHoursSpecification` | OpeningHoursSpecification | Estándar, nocturno, 24h, estacional |
| `telephone` | Text | Debe coincidir con GBP y el NAP de la página |
| `url` | URL | URL canónica de esta ubicación |
| `priceRange` | Text | Menos de 100 caracteres |
| `image` | URL | Foto del negocio |
| `review` | Review | Reseñas individuales |
| `department` | LocalBusiness | Para departamentos anidados (concesionarios) |
| `menu` | URL o Menu | Solo restaurantes |
| `servesCuisine` | Text | Solo restaurantes |

### Específicas de SAB (Service Area Business)

| Propiedad | Tipo | Notas |
|-----------|------|-------|
| `areaServed` | Place/GeoShape | NO está en la lista oficial recomendada de Google pero sí soportada por Schema.org. Recomendada por el sector para SABs. Usa ciudades con nombre y enlaces `sameAs` a Wikipedia/Wikidata. |

---

## Patrones de Schema Específicos por Sector

### Restaurante
```
Restaurant (o subtipo específico)
  + Menu > MenuSection > MenuItem (name, price, nutrition, suitableForDiet)
  + ReserveAction (capacidad de reserva)
  + OrderAction (para llevar/reparto)
  + servesCuisine, acceptsReservations
```
Nota: Google Food Ordering (GFO) con checkout directo se descontinuó en junio de 2024. El botón "Pedir online" ahora redirige a plataformas de terceros.

### Sanidad
```
MedicalClinic (o Hospital, Dentist)
  + Páginas de Physician: Person + medicalSpecialty + hospitalAffiliation + hasCredential
  + MedicalSpecialty (ayuda a asociar "cirugía de cadera" con las páginas relevantes)
  + sameAs: enlace a la ficha del NPI Registry y a la página del colegio médico
```
**Restricción HIPAA**: no se puede confirmar/negar que quien deja una reseña sea paciente en las respuestas a reseñas. Precedente de multa: 30.000$ (Manasa Health Center, 2023).

### Legal
```
LegalService (NO Attorney -- obsoleto)
  + Person en páginas de biografía de abogados: jobTitle, worksFor, alumniOf, hasCredential (colegiación)
  + makesOffer > Service (uno por área de práctica)
  + GBP de cada profesional: teléfono único por abogado, no un único despacho compartido
```
Nota: las reseñas siguen al listado del profesional cuando un abogado cambia de despacho.

### Servicios para el Hogar
```
Subtipo específico (Plumber, Electrician, etc.)
  + areaServed: ciudades con nombre y sameAs a Wikipedia/Wikidata
  + Service en páginas de servicio individuales, vinculado vía provider
  + hasOfferCatalog para listados de servicios
```
**Nota SAB**: el área de servicio en GBP actualmente NO impacta en el ranking -- los rankings se basan en la dirección de verificación (Sterling Sky, marzo 2025).

### Inmobiliaria
```
RealEstateAgent (tanto para agente como para inmobiliaria)
  + Person en páginas de agente: memberOf (inmobiliaria), credentials
  + RealEstateListing + SingleFamilyResidence/Apartment + Offer (precio)
  + Event para jornadas de puertas abiertas con el agente organizador
```
Nota: no existe el tipo `RealEstateBrokerage` en Schema.org.

### Automoción
```
AutoDealer (ventas)
  + Car/Vehicle: VIN, kilometraje, fuelType, vehicleTransmission
  + Offer: price, priceCurrency, availability
  + GBP separados: AutoRepair (taller), AutoPartsStore (recambios)
```
**VehicleListing obsoleto desde el 12 de junio de 2025** (Confirmado). Usar Car + Offer en su lugar. Los listados de vehículos basados en feed vía Google Merchant Center siguen funcionando.

---

## Fuentes de Citas Específicas por Sector

### Restaurante
Yelp, TripAdvisor (más de 1.000M de reseñas), OpenTable (DA + reservas), DoorDash, UberEats, Grubhub, Foursquare (impulsa Apple Maps, Uber)

### Sanidad
Healthgrades (50% de los estadounidenses que visitan a un médico), Zocdoc (reservas + generación de leads), directorio de médicos de WebMD (DA alto), Vitals, Doximity (80% de los médicos de EE.UU.), NPI Registry (fuente de verdad para verificación de entidades), directorios de colegios médicos estatales

### Legal
FindLaw (DA~91, dofollow), Martindale-Hubbell (DA~84, revisión por pares desde 1868), Avvo (valoraciones 1-10, autocreado a partir de datos de colegiación), Justia (DA~70, perfiles gratuitos), Super Lawyers (top 5%, basado en selección), directorios de colegios de abogados estatales (verificación de entidades)

Nota: Internet Brands (KKR) es propietaria de Avvo + Martindale + Lawyers.com + Nolo. Thomson Reuters es propietaria de FindLaw + Super Lawyers + LawInfo.

### Servicios para el Hogar
Thumbtack (400M$ de ingresos en 2024, integraciones con ChatGPT/Alexa/Zillow), BBB, Nextdoor, Yelp. **En declive**: Angi (ingresos -30% desde el pico de 2022), Porch (pivotó a seguros), Houzz (pivotó a SaaS)

### Inmobiliaria
Zillow (44% de todo el tráfico de búsqueda inmobiliaria, integrado en ChatGPT en oct. 2025), Homes.com (nº 2, superó a Realtor.com, 100M de visitantes mensuales), Realtor.com, Redfin (adquirida por Rocket Companies en marzo 2025), sitios MLS locales

### Automoción
Cars.com, AutoTrader, CarGurus, DealerRater (las reseñas se sindican a Cars.com + sitios OEM, soporta valoraciones de comerciales), Edmunds, Kelley Blue Book (autoridad en precios), localizadores de concesionarios del fabricante OEM (verificación de entidades)

---

## Patrón de Schema Multi-Ubicación

```json
// Home: Organization con referencias branchOf
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://ejemplo.com/#org",
  "name": "Nombre de la Marca",
  "url": "https://ejemplo.com"
}

// Cada página de ubicación: LocalBusiness individual
{
  "@context": "https://schema.org",
  "@type": "Dentist",
  "@id": "https://ejemplo.com/ubicaciones/centro/#location",
  "name": "Nombre de la Marca - Centro",
  "branchOf": { "@id": "https://ejemplo.com/#org" },
  "address": { ... },
  "geo": { "latitude": "40.71234", "longitude": "-74.00567" },
  "telephone": "+34-555-123-456",
  "openingHoursSpecification": [ ... ]
}
```

Usa `@id` como identificador único por ubicación. Se recomienda estructura de subdirectorio: `dominio.com/ubicaciones/nombre-ciudad/` (el subdirectorio consolida mejor el link equity que un subdominio, estudio de Bruce Clay: aumento de tráfico del 50%+).

---

## Schema Local Obsoleto/No Válido

| Tipo | Estado | Fecha | Usar en su Lugar |
|------|--------|-------|----------------------|
| `Attorney` | Obsoleto según Schema.org | -- | `LegalService` + `Person` |
| `VehicleListing` | Rich results eliminados | 12 de junio de 2025 | `Car` + `Offer` |
| `HowTo` | Rich results eliminados | Septiembre 2023 | Ninguno |
| `SpecialAnnouncement` | Obsoleto | 31 de julio de 2025 | Ninguno |
