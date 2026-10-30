/**
 * Parseo de texto plano / CSV / TSV para alta masiva de productos.
 * Formato principal: producto ; cantidad ; precio unitario
 * Separadores: ; , o tab. Con o sin encabezado.
 */

export type BulkCreateRow = {
  name: string;
  price: number;
  stock?: number;
  /** Campos opcionales si el usuario pega un CSV más completo */
  cost?: number;
  barcode?: string;
  category?: string;
  brand?: string;
};

export type BulkParseError = { row: number; message: string };

export type BulkParseResult = {
  rows: Array<BulkCreateRow & { line: number }>;
  errors: BulkParseError[];
};

const HEADER_ALIASES: Record<string, keyof BulkCreateRow | 'skip'> = {
  nombre: 'name',
  name: 'name',
  producto: 'name',
  descripcion: 'name',
  descripción: 'name',
  precio: 'price',
  price: 'price',
  precio_venta: 'price',
  precio_unitario: 'price',
  pvp: 'price',
  costo: 'cost',
  cost: 'cost',
  stock: 'stock',
  stock_actual: 'stock',
  cantidad: 'stock',
  qty: 'stock',
  unidades: 'stock',
  codigo_barras: 'barcode',
  código_barras: 'barcode',
  codigo: 'barcode',
  barcode: 'barcode',
  ean: 'barcode',
  categoria: 'category',
  categoría: 'category',
  category: 'category',
  marca: 'brand',
  brand: 'brand',
  id: 'skip',
  stock_minimo: 'skip',
  iva: 'skip',
  vencimiento: 'skip',
  control_stock: 'skip',
};

export function normalizeProductName(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Score 0–100 de similitud entre el nombre pegado y una ficha pública. */
export function scoreCatalogNameMatch(
  query: string,
  candidateName: string,
  candidateBrand?: string | null,
): number {
  const q = normalizeProductName(query);
  const n = normalizeProductName(candidateName);
  if (!q || !n) return 0;
  if (q === n) return 100;
  if (n.startsWith(q) || q.startsWith(n)) return 88;

  const qTokens = q.split(' ').filter((t) => t.length >= 2);
  const nTokens = new Set(n.split(' ').filter((t) => t.length >= 2));
  if (!qTokens.length) return 0;

  const matched = qTokens.filter((t) => n.includes(t) || nTokens.has(t)).length;
  const ratio = matched / qTokens.length;

  if (ratio === 1 && qTokens.length >= 2) return 80;
  if (ratio === 1) return 70;
  if (ratio >= 0.75 && matched >= 2) return 62;
  if (n.includes(q) || q.includes(n)) return 55;

  const brand = normalizeProductName(candidateBrand || '');
  if (brand && q.includes(brand) && matched >= 1) return 58;

  return 0;
}

function normalizeHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function detectDelimiter(sample: string): string {
  const first = sample.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const counts = [
    { sep: ';', n: (first.match(/;/g) || []).length },
    { sep: '\t', n: (first.match(/\t/g) || []).length },
    { sep: ',', n: (first.match(/,/g) || []).length },
  ];
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].sep : ';';
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!s) return null;
  let normalized = s;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',') && !s.includes('.')) {
    normalized = s.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function looksLikeHeader(cells: string[]): boolean {
  const mapped = cells.map((c) => HEADER_ALIASES[normalizeHeader(c)]).filter(Boolean);
  return mapped.includes('name') || mapped.includes('price') || mapped.includes('stock');
}

function buildColumnMap(headers: string[]): Partial<Record<keyof BulkCreateRow, number>> {
  const map: Partial<Record<keyof BulkCreateRow, number>> = {};
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[normalizeHeader(h)];
    if (!key || key === 'skip') return;
    if (map[key] === undefined) map[key] = i;
  });
  return map;
}

/**
 * Sin encabezado (formato pedido):
 *   producto ; cantidad ; precio_unitario
 * Con 2 columnas: producto ; precio
 */
function positionalMap(cellCount: number): Partial<Record<keyof BulkCreateRow, number>> {
  if (cellCount <= 2) return { name: 0, price: 1 };
  return { name: 0, stock: 1, price: 2 };
}

function cellAt(cells: string[], index: number | undefined): string {
  if (index === undefined || index < 0 || index >= cells.length) return '';
  return cells[index] ?? '';
}

function rowFromCells(
  cells: string[],
  colMap: Partial<Record<keyof BulkCreateRow, number>>,
  line: number,
): { row?: BulkCreateRow & { line: number }; error?: BulkParseError } {
  const name = cellAt(cells, colMap.name).trim();
  if (!name) {
    return { error: { row: line, message: 'Falta el nombre del producto' } };
  }

  const priceRaw = cellAt(cells, colMap.price);
  const price = parseNumber(priceRaw);
  if (price == null || price < 0) {
    return { error: { row: line, message: `Precio unitario inválido: "${priceRaw || '(vacío)'}"` } };
  }

  const stockRaw = cellAt(cells, colMap.stock);
  let stockNum: number | null = null;
  if (stockRaw) {
    stockNum = parseNumber(stockRaw);
    if (stockNum == null || stockNum < 0) {
      return { error: { row: line, message: `Cantidad inválida: "${stockRaw}"` } };
    }
    stockNum = Math.floor(stockNum);
  }

  const costRaw = cellAt(cells, colMap.cost);
  const cost = costRaw ? parseNumber(costRaw) : null;
  if (costRaw && (cost == null || cost < 0)) {
    return { error: { row: line, message: `Costo inválido: "${costRaw}"` } };
  }

  const barcode = cellAt(cells, colMap.barcode).trim() || undefined;
  const category = cellAt(cells, colMap.category).trim() || undefined;
  const brand = cellAt(cells, colMap.brand).trim() || undefined;

  return {
    row: {
      line,
      name,
      price,
      ...(stockNum != null ? { stock: stockNum } : {}),
      ...(cost != null ? { cost } : {}),
      ...(barcode ? { barcode } : {}),
      ...(category ? { category } : {}),
      ...(brand ? { brand } : {}),
    },
  };
}

const MAX_ROWS = 500;

export function parseBulkCreateText(text: string): BulkParseResult {
  const cleaned = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!cleaned) {
    return { rows: [], errors: [{ row: 0, message: 'Pegá al menos una línea de productos.' }] };
  }

  const sep = detectDelimiter(cleaned);
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (!lines.length) {
    return { rows: [], errors: [{ row: 0, message: 'No hay filas para importar.' }] };
  }

  let start = 0;
  let colMap: Partial<Record<keyof BulkCreateRow, number>>;
  const firstCells = splitLine(lines[0], sep);

  if (looksLikeHeader(firstCells)) {
    colMap = buildColumnMap(firstCells);
    if (colMap.name === undefined) {
      return { rows: [], errors: [{ row: 1, message: 'El encabezado debe incluir producto/nombre.' }] };
    }
    if (colMap.price === undefined) {
      return { rows: [], errors: [{ row: 1, message: 'El encabezado debe incluir precio unitario.' }] };
    }
    start = 1;
  } else {
    colMap = positionalMap(firstCells.length);
  }

  const rows: Array<BulkCreateRow & { line: number }> = [];
  const errors: BulkParseError[] = [];
  const dataLines = lines.slice(start);

  if (dataLines.length > MAX_ROWS) {
    errors.push({
      row: 0,
      message: `Máximo ${MAX_ROWS} productos por carga. Se procesarán solo las primeras ${MAX_ROWS}.`,
    });
  }

  const limited = dataLines.slice(0, MAX_ROWS);
  for (let i = 0; i < limited.length; i++) {
    const lineNumber = start + i + 1;
    const cells = splitLine(limited[i], sep);
    if (cells.every((c) => !c.trim())) continue;
    const parsed = rowFromCells(cells, colMap, lineNumber);
    if (parsed.error) errors.push(parsed.error);
    else if (parsed.row) rows.push(parsed.row);
  }

  return { rows, errors };
}

export const BULK_CREATE_EXAMPLE = `producto;cantidad;precio
Coca Cola 500ml;24;1500
Alfajor Havanna;50;800
Agua Villavicencio 2L;12;1200`;
