# Precios Claros (SEPA) — plan StockRápido

## Estado (v2)

Cliente live contra CloudFront + match por nombre (heurística / IA opcional) + asociación de EAN coexistente con el barcode actual.

## Objetivo

1. Buscar por EAN o nombre y sugerir coincidencias.
2. Match aproximado de nombres; OpenAI opcional si el negocio tiene key.
3. Enriquecer campos vacíos (marca, presentación) sin pisar lo ya cargado.
4. Traer el EAN de Precios Claros a `allCodes` **sin reemplazar** el barcode (ambos coexisten).

## Config

`Business.posConfig.preciosClaros`: `{ enabled, lat, lng, branchIds[] }`

Por defecto usa CABA (`-34.6037, -58.3816`) si no hay config.
