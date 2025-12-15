export type ProductTemplate = {
  id: string;
  label: string;
  base?: string;
  note?: string;
  sizes?: string[];
  colors?: string[];
  categoryId: string;
  categoryLabel: string;
  mockup?: {
    aspectRatio: number;
    printArea: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    backgroundKind: "tee" | "hoodie" | "crewneck" | "poster" | "mug" | "generic";
  };
};

export type ProductCategory = {
  id: string;
  label: string;
  items: ProductTemplate[];
};

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  {
    id: "apparel",
    label: "Apparel",
    items: [
      {
        id: "tee",
        label: "Tee (DTG)",
        base: "Bella+Canvas 3001",
        note: "S-4XL, multiple colors",
        sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
        colors: ["Black", "Navy", "White", "Sport Grey"],
        categoryId: "apparel",
        categoryLabel: "Apparel",
        mockup: {
          aspectRatio: 3 / 4,
          printArea: { x: 0.2, y: 0.18, width: 0.6, height: 0.5 },
          backgroundKind: "tee",
        },
      },
      {
        id: "hoodie",
        label: "Hoodie",
        base: "Gildan 18500",
        note: "S-5XL, fleece",
        sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
        colors: ["Black", "Navy", "White", "Sport Grey"],
        categoryId: "apparel",
        categoryLabel: "Apparel",
        mockup: {
          aspectRatio: 3 / 4,
          printArea: { x: 0.22, y: 0.2, width: 0.56, height: 0.5 },
          backgroundKind: "hoodie",
        },
      },
      {
        id: "crewneck",
        label: "Crewneck",
        base: "Gildan 18000",
        note: "S-5XL",
        sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
        colors: ["Black", "Navy", "Sand", "Sport Grey"],
        categoryId: "apparel",
        categoryLabel: "Apparel",
        mockup: {
          aspectRatio: 3 / 4,
          printArea: { x: 0.22, y: 0.22, width: 0.56, height: 0.46 },
          backgroundKind: "crewneck",
        },
      },
      {
        id: "joggers",
        label: "Joggers/Leggings",
        base: "All-over",
        note: "Unisex / Women",
        sizes: ["XS", "S", "M", "L", "XL", "2XL"],
        colors: ["Black", "White"],
        categoryId: "apparel",
        categoryLabel: "Apparel",
      },
    ],
  },
  {
    id: "headwear",
    label: "Headwear",
    items: [
      { id: "cap", label: "Hat (Embroidered)", base: "YP Classics 6245CM", note: "Strapback", categoryId: "headwear", categoryLabel: "Headwear" },
      { id: "trucker", label: "Trucker Cap", base: "YP Classics 6606", note: "Mesh back", categoryId: "headwear", categoryLabel: "Headwear" },
      { id: "beanie", label: "Beanie", base: "Sportsman SP15", note: "Embroidered", categoryId: "headwear", categoryLabel: "Headwear" },
    ],
  },
  {
    id: "accessories",
    label: "Accessories",
    items: [
      { id: "tote", label: "Tote Bag", base: "Premium Tote", note: "All-over or classic", categoryId: "accessories", categoryLabel: "Accessories" },
      { id: "backpack", label: "Backpack", base: "All-over", note: "Padded", categoryId: "accessories", categoryLabel: "Accessories" },
      { id: "socks", label: "Socks", base: "All-over", note: "Crew", categoryId: "accessories", categoryLabel: "Accessories" },
      { id: "fannypack", label: "Fanny Pack", base: "All-over", note: "Adjustable strap", categoryId: "accessories", categoryLabel: "Accessories" },
    ],
  },
  {
    id: "drinkware",
    label: "Drinkware",
    items: [
      { id: "mug", label: "Mug", base: "Ceramic", note: "11oz / 15oz", categoryId: "drinkware", categoryLabel: "Drinkware" },
      { id: "tumbler", label: "Tumbler", base: "Stainless", note: "20oz", categoryId: "drinkware", categoryLabel: "Drinkware" },
      { id: "bottle", label: "Water Bottle", base: "Stainless", note: "17oz", categoryId: "drinkware", categoryLabel: "Drinkware" },
    ],
  },
  {
    id: "wallart",
    label: "Wall Art",
    items: [
      { id: "poster", label: "Poster", base: "Premium Matte", note: "Multiple sizes", categoryId: "wallart", categoryLabel: "Wall Art" },
      { id: "framed", label: "Framed Poster", base: "Matte + Frame", note: "Multiple sizes", categoryId: "wallart", categoryLabel: "Wall Art" },
      { id: "canvas", label: "Canvas", base: "Gallery wrap", note: "Multiple sizes", categoryId: "wallart", categoryLabel: "Wall Art" },
      { id: "metal", label: "Metal Print", base: "Metal", note: "Small/Medium", categoryId: "wallart", categoryLabel: "Wall Art" },
    ],
  },
  {
    id: "phone",
    label: "Phone Cases",
    items: [
      { id: "iphone", label: "iPhone Case", base: "Tough/Glossy", note: "Popular models", categoryId: "phone", categoryLabel: "Phone Cases" },
      { id: "android", label: "Android Case", base: "Select models", note: "Slim/Tough", categoryId: "phone", categoryLabel: "Phone Cases" },
    ],
  },
  {
    id: "stickers",
    label: "Stickers",
    items: [
      { id: "sticker", label: "Kiss-cut Sticker", base: "White/Transparent", note: "Multiple sizes", categoryId: "stickers", categoryLabel: "Stickers" },
      { id: "decal", label: "Decal", base: "Durable", note: "Indoor/Outdoor", categoryId: "stickers", categoryLabel: "Stickers" },
    ],
  },
  {
    id: "home",
    label: "Home & Living",
    items: [
      { id: "pillow", label: "Throw Pillow", base: "All-over", note: "Multiple sizes", categoryId: "home", categoryLabel: "Home & Living" },
      { id: "blanket", label: "Blanket", base: "Sherpa/Fleece", note: "Multiple sizes", categoryId: "home", categoryLabel: "Home & Living" },
      { id: "deskmat", label: "Desk/Mouse Pad", base: "All-over", note: "Gaming sizes", categoryId: "home", categoryLabel: "Home & Living" },
      { id: "flag", label: "Flag", base: "All-over", note: "Multiple sizes", categoryId: "home", categoryLabel: "Home & Living" },
    ],
  },
];

export function findTemplateById(templateId?: string | null): ProductTemplate | null {
  if (!templateId) return null;
  for (const category of PRODUCT_CATEGORIES) {
    const match = category.items.find((item) => item.id === templateId);
    if (match) return match;
  }
  return null;
}
