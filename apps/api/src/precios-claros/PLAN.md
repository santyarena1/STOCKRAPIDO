/**
 * Precios Claros — plan StockRápido v3
 *
 * ## Base completa
 * Sí existe dataset oficial SEPA (~70k productos / ~12M precios/día) en
 * https://datos.produccion.gob.ar/dataset/sepa-precios
 * Los zips diarios son enormes para serverless; por eso cacheamos un catálogo
 * local (PreciosClarosCatalog) y lo llenamos de dos formas:
 * 1) Semilla desde los nombres de tu negocio (búsqueda live CloudFront).
 * 2) Barrido por categorías (sync-chunk) hasta completar el catálogo.
 *
 * ## Módulo masivo `/precios-claros`
 * - Match heurístico catálogo + live
 * - IA opcional: reordena candidatos y sugiere búsquedas alternativas
 * - Aplicar EAN sin pisar el barcode actual (coexisten en allCodes)
 */
export {};
