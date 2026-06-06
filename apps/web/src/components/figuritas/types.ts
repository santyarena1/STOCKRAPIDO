export type StickerRow = { id: string; number: number; stock: number };

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
  business: { name: string };
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
