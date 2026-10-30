/**
 * Parseo de texto plano / CSV / TSV para alta masiva de productos.
 * Acepta separadores ; , o tab, con o sin encabezado.
 */

export type BulkCreateRow = {
  name: string;
  price: number;
  cost?: number;
  stock?: number;
  minStock?: number;
  barcode?: string;
  category?: string;
  brand?: string;
  iva?: number;
  expiresAt?: string;
  stockControl?: boolean;
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
  pvp: 'price',
  costo: 'cost',
  cost: 'cost',
  coste: 'cost',
  stock: 'stock',
  stock_actual: 'stock',
  cantidad: 'stock',
  stock_minimo: 'minStock',
  stock_mínimo: 'minStock',
  minimo: 'minStock',
  mínimo: 'minStock',
  minstock: 'minStock',
  codigo_barras: 'barcode',
  código_barras: 'barcode',
  codigo: 'barcode',
  código: 'barcode',
  barcode: 'barcode',
  ean: 'barcode',
  categoria: 'category',
  categoría: 'category',
  category: 'category',
  marca: 'brand',
  brand: 'brand',
  iva: 'iva',
  vencimiento: 'expiresAt',
  expiresat: 'expiresAt',
  expires_at: 'expiresAt',
  control_stock: 'stockControl',
  stockcontrol: 'stockControl',
  // columnas de export que no usamos al crear
  id: 'skip',
};

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

/** Split CSV-like line respecting double quotes. */
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
  // 1.234,56 (es-AR) o 1234.56
  let normalized = s;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',') && !s.includes('.')) {
    normalized = s.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw: string): boolean | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (['1', 'true', 'si', 'sí', 'yes', 'y', 's'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return undefined;
}

function looksLikeHeader(cells: string[]): boolean {
  const mapped = cells.map((c) => HEADER_ALIASES[normalizeHeader(c)]).filter(Boolean);
  return mapped.includes('name') || mapped.includes('price');
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

/** Sin encabezado: nombre;precio[;stock][;costo][;codigo][;categoria][;marca] */
function positionalMap(cellCount: number): Partial<Record<keyof BulkCreateRow, number>> {
  const map: Partial<Record<keyof BulkCreateRow, number>> = { name: 0, price: 1 };
  if (cellCount >= 3) map.stock = 2;
  if (cellCount >= 4) map.cost = 3;
  if (cellCount >= 5) map.barcode = 4;
  if (cellCount >= 6) map.category = 5;
  if (cellCount >= 7) map.brand = 6;
  return map;
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
    return { error: { row: line, message: 'Falta el nombre' } };
  }
  const priceRaw = cellAt(cells, colMap.price);
  const price = parseNumber(priceRaw);
  if (price == null || price < 0) {
    return { error: { row: line, message: `Precio inválido: "${priceRaw || '(vacío)'}"` } };
  }

  const costRaw = cellAt(cells, colMap.cost);
  const cost = costRaw ? parseNumber(costRaw) : null;
  if (costRaw && (cost == null || cost < 0)) {
    return { error: { row: line, message: `Costo inválido: "${costRaw}"` } };
  }

  const stockRaw = cellAt(cells, colMap.stock);
  const stockNum = stockRaw ? parseNumber(stockRaw) : null;
  if (stockRaw && (stockNum == null || stockNum < 0 || !Number.isInteger(stockNum))) {
    return { error: { row: line, message: `Stock inválido: "${stockRaw}"` } };
  }

  const minRaw = cellAt(cells, colMap.minStock);
  const minNum = minRaw ? parseNumber(minRaw) : null;
  if (minRaw && (minNum == null || minNum < 0 || !Number.isInteger(minNum))) {
    return { error: { row: line, message: `Stock mínimo inválido: "${minRaw}"` } };
  }

  const ivaRaw = cellAt(cells, colMap.iva);
  const iva = ivaRaw ? parseNumber(ivaRaw) : null;
  if (ivaRaw && (iva == null || iva < 0)) {
    return { error: { row: line, message: `IVA inválido: "${ivaRaw}"` } };
  }

  const stockControlRaw = cellAt(cells, colMap.stockControl);
  const stockControl = stockControlRaw ? parseBool(stockControlRaw) : undefined;

  const barcode = cellAt(cells, colMap.barcode).trim() || undefined;
  const category = cellAt(cells, colMap.category).trim() || undefined;
  const brand = cellAt(cells, colMap.brand).trim() || undefined;
  const expiresAt = cellAt(cells, colMap.expiresAt).trim() || undefined;

  return {
    row: {
      line,
      name,
      price,
      ...(cost != null ? { cost } : {}),
      ...(stockNum != null ? { stock: Math.floor(stockNum) } : {}),
      ...(minNum != null ? { minStock: Math.floor(minNum) } : {}),
      ...(barcode ? { barcode } : {}),
      ...(category ? { category } : {}),
      ...(brand ? { brand } : {}),
      ...(iva != null ? { iva } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(stockControl !== undefined ? { stockControl } : {}),
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
      return { rows: [], errors: [{ row: 1, message: 'El encabezado debe incluir una columna de nombre.' }] };
    }
    if (colMap.price === undefined) {
      return { rows: [], errors: [{ row: 1, message: 'El encabezado debe incluir una columna de precio.' }] };
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

export const BULK_CREATE_EXAMPLE = `nombre;precio;stock;costo;codigo_barras;categoria;marca
Coca Cola 500ml;1500;24;900;7790895001234;Bebidas;Coca-Cola
Alfajor Havanna;800;50;450;;Golosinas;Havanna`;
