export type ProductSpec = {
  label: string;
  value: string;
};

export type Product = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  kind?: "equipment" | "part" | "accessory";
  engineBrand?: string;
  operation: string | null;
  price: number | null;
  compareAtPrice?: number;
  isMockPrice: boolean;
  rating: number | null;
  stock: number | null;
  availability?: "available" | "unavailable" | "unknown";
  warrantyMonths: number | null;
  badge?: string;
  featured?: boolean;
  shortDescription: string;
  description: string;
  recommendedUse: string;
  image: string;
  images?: ReadonlyArray<Readonly<{ src: string; alt: string }>>;
  specs: ProductSpec[];
  includes: string[];
  searchTerms: string[];
};
