/**
 * Precios Claros (SEPA) — plan de integración StockRápido
 *
 * Estado: no había implementación previa en el repo. Este documento arranca el plan.
 *
 * Qué es
 * - Portal del gobierno (preciosclaros.gob.ar / SEPA) con precios de góndola por EAN/SKU
 *   en cadenas minoristas y mayoristas.
 * - No hay API pública oficial documentada para terceros. El sitio usa endpoints internos
 *   (CloudFront) y también se publican datasets diarios en datos.gob.ar.
 *
 * Objetivo en StockRápido
 * 1) Buscar un producto por EAN/nombre y sugerir precio de referencia de mercado.
 * 2) Enriquecer ficha (nombre, marca, presentación) cuando falten datos.
 * 3) (Más adelante) comparar tu precio vs medianas de zona.
 *
 * Enfoque recomendado (por etapas)
 * A. Cliente de lectura (solo consulta) detrás de nuestra API Nest, nunca desde el browser
 *    directo (CORS + API key del front del sitio).
 * B. Cache en DB por EAN (TTL 24h) para no martillar el origen.
 * C. UI: botón “Buscar en Precios Claros” en ficha de producto y en producto rápido del POS.
 * D. Dataset SEPA (datos.gob.ar) como fallback offline / batch si el endpoint live falla.
 *
 * Riesgos
 * - Endpoint no oficial: puede cambiar o pedir headers/API key rotativos.
 * - Términos de uso del SEPA: uso para el negocio propio, no redistribuir masivamente.
 *
 * Próximo paso de código
 * - Módulo `apps/api/src/precios-claros/` con searchByEan / searchByName (stub + HTTP).
 * - Feature flag en business.posConfig.preciosClarosEnabled.
 * - Pantalla Config → Precios Claros (zona/sucursales preferidas).
 */

export const PRECIOS_CLAROS_PLAN_VERSION = 1;
