export type StickerRow = {
  id: string;
  number: number;
  stock: number;
  priceUnit?: number | string | null;
  effectivePrice?: number | string | null;
};

export type CountryRow = {
  id: string;
  name: string;
  code?: string | null;
  flag?: string | null;
  flagUrl?: string | null;
  priceUnit: number | string;
  maxNumber?: number;
  availableCount?: number;
  totalUnits?: number;
  stickers: StickerRow[];
  _count?: { stickers: number };
  isActive?: boolean;
};

export type CatalogResponse = {
  business: { name: string; address?: string | null };
  meta: { title: string; description: string };
  stats: {
    countries: number;
    totalSlots: number;
    availableSlots: number;
    availableUnits: number;
  };
  countries: CountryRow[];
};

export type CartLine = {
  stickerId: string;
  countryId: string;
  countryName: string;
  flag?: string | null;
  flagUrl?: string | null;
  number: number;
  priceUnit: number;
  qty: number;
  maxStock: number;
};

/** Precio efectivo: override de figurita → effectivePrice API → precio del país */
export function stickerEffectivePrice(
  sticker: Pick<StickerRow, 'priceUnit' | 'effectivePrice'>,
  countryPrice: number | string,
): number {
  if (sticker.effectivePrice != null && sticker.effectivePrice !== '') {
    return Number(sticker.effectivePrice) || 0;
  }
  if (sticker.priceUnit != null && sticker.priceUnit !== '') {
    return Number(sticker.priceUnit) || 0;
  }
  return Number(countryPrice) || 0;
}
