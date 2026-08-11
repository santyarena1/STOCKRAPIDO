/**
 * Junta TODOS los códigos de un producto (de sus columnas y del raw del proveedor)
 * en un único string separado por espacios, para poder buscar/filtrar por cualquiera
 * sin depender de qué "slot" (unidad/display/bulto/ref/sku) le tocó a cada uno.
 */
export function collectAllCodes(raw: any, extra: Array<string | null | undefined> = []): string | null {
  const codes = new Set<string>();
  const add = (v: any) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s && s.length >= 3 && s.length <= 40) codes.add(s);
  };
  for (const e of extra) add(e);
  if (raw && typeof raw === 'object') {
    add(raw.productReference); add(raw.refId); add(raw.skuId); add(raw.ean); add(raw.eanBox);
    for (const s of Array.isArray(raw.skus) ? raw.skus : []) { add(s?.ref_id); add(s?.refId); add(s?.sku_id); add(s?.skuId); add(s?.ean); }
    for (const v of Array.isArray(raw.variants) ? raw.variants : []) { add(v?.refId); add(v?.ean); add(v?.skuId); }
    for (const it of Array.isArray(raw.items) ? raw.items : []) {
      add(it?.ean); add(it?.itemId);
      for (const r of Array.isArray(it?.referenceId) ? it.referenceId : []) add(r?.Value);
      for (const r of Array.isArray(it?.referenceIds) ? it.referenceIds : []) add(r?.Value);
      for (const img of Array.isArray(it?.ean) ? it.ean : []) add(img);
    }
  }
  const joined = [...codes].join(' ');
  return joined || null;
}
