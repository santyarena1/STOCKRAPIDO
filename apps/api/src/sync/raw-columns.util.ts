export type RawColumnType = 'number' | 'string' | 'boolean' | 'mixed';

export type FlatValue = { path: string; value: string | number | boolean };

export type RawColumnInfo = {
  path: string;
  type: RawColumnType;
  coverage: number;
  total: number;
  samples: string[];
  mapped?: boolean;
  mappedTo?: string;
};

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/** Aplana JSON usando puntos y colapsando todos los índices de arrays a []. */
export function flatten(value: unknown, prefix = ''): FlatValue[] {
  const result: FlatValue[] = [];

  const visit = (node: unknown, path: string) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      const arrayPath = `${path}[]`;
      for (const item of node) {
        if (isScalar(item)) result.push({ path: arrayPath, value: item });
        else if (item && typeof item === 'object') visit(item, arrayPath);
      }
      return;
    }
    if (typeof node === 'object') {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        visit(child, path ? `${path}.${key}` : key);
      }
      return;
    }
    if (path && isScalar(node)) result.push({ path, value: node });
  };

  visit(value, prefix);
  return result;
}

const valueType = (value: string | number | boolean): Exclude<RawColumnType, 'mixed'> =>
  typeof value as Exclude<RawColumnType, 'mixed'>;

const sampleValue = (value: unknown) => {
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

export function discoverRawColumns(
  rows: Array<Record<string, any>>,
  mappedFields: readonly string[] = [],
): RawColumnInfo[] {
  const aggregate = new Map<string, { coverage: number; types: Set<string>; samples: string[] }>();

  for (const row of rows) {
    const perProduct = new Map<string, Array<string | number | boolean>>();
    for (const pair of flatten(row.raw)) {
      const values = perProduct.get(pair.path) ?? [];
      values.push(pair.value);
      perProduct.set(pair.path, values);
    }
    for (const [path, values] of perProduct) {
      const current = aggregate.get(path) ?? { coverage: 0, types: new Set<string>(), samples: [] };
      current.coverage += 1;
      for (const value of values) {
        current.types.add(valueType(value));
        const sample = sampleValue(value);
        if (!current.samples.includes(sample) && current.samples.length < 3) current.samples.push(sample);
      }
      aggregate.set(path, current);
    }
  }

  const columns: RawColumnInfo[] = [...aggregate.entries()].map(([path, info]) => ({
    path,
    type: info.types.size === 1 ? ([...info.types][0] as RawColumnType) : 'mixed',
    coverage: info.coverage,
    total: rows.length,
    samples: info.samples,
    mapped: false,
  }));

  for (const field of mappedFields) {
    const values = rows.map((row) => row[field]).filter((value) => value != null);
    if (!values.length) continue;
    const types = new Set(values.filter(isScalar).map(valueType));
    columns.push({
      path: `synced.${field}`,
      type: types.size === 1 ? ([...types][0] as RawColumnType) : 'mixed',
      coverage: values.length,
      total: rows.length,
      samples: [...new Set(values.map(sampleValue))].slice(0, 3),
      mapped: true,
      mappedTo: field,
    });
  }

  return columns.sort((a, b) => b.coverage - a.coverage || a.path.localeCompare(b.path));
}
