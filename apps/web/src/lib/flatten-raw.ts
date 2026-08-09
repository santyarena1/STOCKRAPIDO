export type FlatRawValue = { path: string; value: string | number | boolean };

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/** Misma convención del backend: objetos con puntos y cualquier índice de array como []. */
export function flattenRaw(value: unknown, prefix = ''): FlatRawValue[] {
  const result: FlatRawValue[] = [];
  const visit = (node: unknown, path: string) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      const arrayPath = `${path}[]`;
      node.forEach((item) => {
        if (isScalar(item)) result.push({ path: arrayPath, value: item });
        else if (item && typeof item === 'object') visit(item, arrayPath);
      });
      return;
    }
    if (typeof node === 'object') {
      Object.entries(node as Record<string, unknown>).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
      return;
    }
    if (path && isScalar(node)) result.push({ path, value: node });
  };
  visit(value, prefix);
  return result;
}

export function rawValuesAtPath(raw: unknown, path: string): Array<string | number | boolean> {
  return flattenRaw(raw).filter((item) => item.path === path).map((item) => item.value);
}
