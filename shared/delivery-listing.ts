/** Reglas de listing, pricing y validación — compartido API + web. */

export const DELIVERY_PROVIDER_IDS = ['rappi', 'pedidosya'] as const;
export type DeliveryProviderId = (typeof DELIVERY_PROVIDER_IDS)[number];

export type DeliveryFieldSource =
  | 'name'
  | 'barcode'
  | 'supplierSku'
  | 'externalId'
  | 'price'
  | 'cost'
  | 'categoryId'
  | 'categoryName'
  | 'brand'
  | 'imageUrl'
  | 'iva'
  | 'weight'
  | 'presentation'
  | 'description'
  | 'shortDescription'
  | 'platformCategoryId'
  | 'platformCategoryName'
  | 'listPrice'
  | 'isActive'
  | 'stock'
  | 'stockControl';

export type DeliveryFieldRequirement = {
  key: DeliveryFieldSource;
  label: string;
  level: 'required' | 'recommended';
  hint?: string;
};

export type DeliveryListingInput = {
  name?: string | null;
  barcode?: string | null;
  supplierSku?: string | null;
  externalId?: string | null;
  price?: number | string | null;
  cost?: number | string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  iva?: number | string | null;
  weight?: string | null;
  presentation?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  platformCategoryId?: string | null;
  platformCategoryName?: string | null;
  listPrice?: number | string | null;
  isActive?: boolean;
  stock?: number;
  stockControl?: boolean;
};

export type DeliveryValidationIssue = {
  key: string;
  label: string;
  level: 'required' | 'recommended';
};

export type DeliveryReadiness = {
  provider: DeliveryProviderId;
  ready: boolean;
  requiredMissing: DeliveryValidationIssue[];
  recommendedMissing: DeliveryValidationIssue[];
  published: boolean;
  listPrice: number | null;
  syncStatus: string | null;
};

const RAPPI_REQUIREMENTS: DeliveryFieldRequirement[] = [
  { key: 'name', label: 'Nombre', level: 'required' },
  { key: 'barcode', label: 'Código de barras / SKU', level: 'required', hint: 'Usado como SKU en Rappi' },
  { key: 'price', label: 'Precio mostrador', level: 'required' },
  { key: 'categoryName', label: 'Categoría local', level: 'required' },
  { key: 'platformCategoryName', label: 'Categoría Rappi', level: 'required' },
  { key: 'shortDescription', label: 'Descripción corta', level: 'required', hint: 'Aparece en la ficha del producto' },
  { key: 'imageUrl', label: 'Imagen', level: 'recommended', hint: 'Mejora conversión en la app' },
  { key: 'brand', label: 'Marca', level: 'recommended' },
  { key: 'weight', label: 'Peso / contenido', level: 'recommended' },
  { key: 'presentation', label: 'Presentación', level: 'recommended' },
];

const PEDIDOSYA_REQUIREMENTS: DeliveryFieldRequirement[] = [
  { key: 'name', label: 'Nombre', level: 'required' },
  { key: 'barcode', label: 'Código / SKU remoto', level: 'required' },
  { key: 'price', label: 'Precio mostrador', level: 'required' },
  { key: 'categoryName', label: 'Categoría local', level: 'required' },
  { key: 'platformCategoryName', label: 'Categoría PedidosYa', level: 'required' },
  { key: 'shortDescription', label: 'Descripción', level: 'required' },
  { key: 'imageUrl', label: 'Imagen', level: 'required', hint: 'PedidosYa suele exigir foto para publicar' },
  { key: 'iva', label: 'IVA / alícuota', level: 'recommended' },
  { key: 'brand', label: 'Marca', level: 'recommended' },
  { key: 'presentation', label: 'Presentación', level: 'recommended' },
];

export const DELIVERY_FIELD_REQUIREMENTS: Record<DeliveryProviderId, DeliveryFieldRequirement[]> = {
  rappi: RAPPI_REQUIREMENTS,
  pedidosya: PEDIDOSYA_REQUIREMENTS,
};

export function deliveryProviderLabel(provider: DeliveryProviderId): string {
  return provider === 'rappi' ? 'Rappi' : 'PedidosYa';
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : '';
}

function hasSku(input: DeliveryListingInput): boolean {
  return Boolean(str(input.barcode) || str(input.supplierSku) || str(input.externalId));
}

function fieldPresent(key: DeliveryFieldSource, input: DeliveryListingInput): boolean {
  switch (key) {
    case 'name':
      return Boolean(str(input.name));
    case 'barcode':
      return hasSku(input);
    case 'supplierSku':
      return Boolean(str(input.supplierSku));
    case 'externalId':
      return Boolean(str(input.externalId));
    case 'price': {
      const p = num(input.price);
      return p != null && p > 0;
    }
    case 'cost': {
      const c = num(input.cost);
      return c != null && c > 0;
    }
    case 'categoryId':
      return Boolean(str(input.categoryId));
    case 'categoryName':
      return Boolean(str(input.categoryName));
    case 'brand':
      return Boolean(str(input.brand));
    case 'imageUrl':
      return Boolean(str(input.imageUrl));
    case 'iva': {
      const v = num(input.iva);
      return v != null && v >= 0;
    }
    case 'weight':
      return Boolean(str(input.weight));
    case 'presentation':
      return Boolean(str(input.presentation));
    case 'description':
      return Boolean(str(input.description) || str(input.shortDescription));
    case 'shortDescription':
      return Boolean(str(input.shortDescription) || str(input.description));
    case 'platformCategoryId':
      return Boolean(str(input.platformCategoryId));
    case 'platformCategoryName':
      return Boolean(str(input.platformCategoryName));
    case 'listPrice': {
      const lp = num(input.listPrice);
      return lp != null && lp > 0;
    }
    case 'isActive':
      return input.isActive !== false;
    case 'stock':
      return input.stockControl === false || (input.stock ?? 0) > 0;
    case 'stockControl':
      return true;
    default:
      return false;
  }
}

export function validateDeliveryListing(
  provider: DeliveryProviderId,
  input: DeliveryListingInput,
): { ready: boolean; issues: DeliveryValidationIssue[] } {
  const issues: DeliveryValidationIssue[] = [];
  for (const req of DELIVERY_FIELD_REQUIREMENTS[provider]) {
    if (req.key === 'barcode' && hasSku(input)) continue;
    if (!fieldPresent(req.key, input)) {
      issues.push({ key: req.key, label: req.label, level: req.level });
    }
  }
  const requiredMissing = issues.filter((i) => i.level === 'required');
  return { ready: requiredMissing.length === 0, issues };
}

/** precio_delivery = precio_base × (1 + margen/100) / (1 - comisión/100) */
export function calculateDeliveryListPrice(
  basePrice: number,
  markupPercent: number,
  commissionPercent: number,
): number {
  const base = Math.max(0, basePrice);
  const markup = Math.max(0, markupPercent);
  const commission = Math.min(99, Math.max(0, commissionPercent));
  const withMarkup = base * (1 + markup / 100);
  const divisor = 1 - commission / 100;
  if (divisor <= 0) return Math.round(withMarkup);
  return Math.round(withMarkup / divisor);
}

export function estimateNetFromListPrice(listPrice: number, commissionPercent: number): number {
  const commission = Math.min(99, Math.max(0, commissionPercent));
  return Math.round(listPrice * (1 - commission / 100));
}

export type ProductForDelivery = DeliveryListingInput & { id: string };

export function productToListingInput(product: {
  name: string;
  barcode?: string | null;
  supplierSku?: string | null;
  externalId?: string | null;
  price: unknown;
  cost?: unknown;
  categoryId?: string | null;
  category?: { name?: string | null } | null;
  brand?: string | null;
  imageUrl?: string | null;
  iva?: unknown;
  weight?: string | null;
  presentation?: string | null;
  isActive?: boolean;
  stock?: number;
  stockControl?: boolean;
}): DeliveryListingInput {
  return {
    name: product.name,
    barcode: product.barcode,
    supplierSku: product.supplierSku,
    externalId: product.externalId,
    price: num(product.price),
    cost: num(product.cost),
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    brand: product.brand,
    imageUrl: product.imageUrl,
    iva: num(product.iva),
    weight: product.weight,
    presentation: product.presentation,
    shortDescription: product.presentation || product.brand || null,
    isActive: product.isActive,
    stock: product.stock,
    stockControl: product.stockControl,
  };
}

export function resolveExternalSku(product: {
  barcode?: string | null;
  supplierSku?: string | null;
  externalId?: string | null;
  id: string;
}): string {
  return str(product.barcode) || str(product.supplierSku) || str(product.externalId) || product.id;
}
