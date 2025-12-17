import type { PlacementSurfaceConfig } from "./placement-types";

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
    backgroundKind: "tee" | "hoodie" | "crewneck" | "poster" | "mug" | "cap" | "beanie" | "generic";
    baseImage?: string;
    colorImages?: Record<string, string>;
    printMethod?: "flat" | "embroidery" | "allover";
    maskSvgUrl?: string;
    placements?: PlacementSurfaceConfig[];
    warp?: {
      /** Source quad (normalized, [x,y]) in order: tl, tr, br, bl */
      src: [number, number][];
      /** Destination quad (normalized, [x,y]) matching src order */
      dst: [number, number][];
      meshDetail?: number;
    };
    printful?: {
      /** Printful product id used by the mockup generator */
      productId: number;
      /** Placement slug accepted by Printful (e.g., "front", "embroidery_front") */
      placement?: string;
      /** Optional override for store id if not using the default env store */
      storeId?: string | null;
      /** Map of color label to one or more Printful variant ids */
      variantIdsByColor?: Record<string, number | number[]>;
    };
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
        colors: ["Black", "Navy", "White", "Athletic Heather", "Dark Grey Heather"],
        categoryId: "apparel",
        categoryLabel: "Apparel",
        mockup: {
          aspectRatio: 3 / 4,
          printArea: { x: 0.2, y: 0.18, width: 0.6, height: 0.5 },
          backgroundKind: "tee",
          baseImage: "/mockups/tee/black.png",
          colorImages: {
            Black: "/mockups/tee/black.png",
            White: "/mockups/tee/white.png",
          },
          placements: [
            {
              id: "front",
              label: "Front",
              printArea: { x: 0.2, y: 0.18, width: 0.6, height: 0.5 },
              printfulPlacement: "front",
              defaultScale: 0.78,
            },
            {
              id: "back",
              label: "Back",
              printArea: { x: 0.2, y: 0.18, width: 0.6, height: 0.5 },
              printfulPlacement: "back",
              defaultScale: 0.78,
            },
            {
              id: "sleeve_left",
              label: "Left sleeve",
              printArea: { x: 0.06, y: 0.28, width: 0.26, height: 0.28 },
              printfulPlacement: "sleeve_left",
              defaultScale: 0.58,
            },
            {
              id: "sleeve_right",
              label: "Right sleeve",
              printArea: { x: 0.68, y: 0.28, width: 0.26, height: 0.28 },
              printfulPlacement: "sleeve_right",
              defaultScale: 0.58,
            },
          ],
          printful: {
            productId: 71,
            placement: "front",
            variantIdsByColor: {
              Black: 4017,
              Navy: 4112,
              White: 4012,
              "Athletic Heather": 6949,
              "Dark Grey Heather": 8461,
              "*": 4017,
            },
          },
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
          baseImage: "/mockups/hoodie/navy.png",
          colorImages: {
            Navy: "/mockups/hoodie/navy.png",
          },
          placements: [
            {
              id: "front",
              label: "Front",
              printArea: { x: 0.22, y: 0.2, width: 0.56, height: 0.5 },
              printfulPlacement: "front",
              defaultScale: 0.78,
            },
            {
              id: "back",
              label: "Back",
              printArea: { x: 0.22, y: 0.2, width: 0.56, height: 0.5 },
              printfulPlacement: "back",
              defaultScale: 0.78,
            },
            {
              id: "pocket",
              label: "Front pocket",
              printArea: { x: 0.34, y: 0.52, width: 0.32, height: 0.16 },
              printfulPlacement: "front",
              defaultScale: 0.54,
            },
            {
              id: "sleeve_left",
              label: "Left sleeve",
              printArea: { x: 0.06, y: 0.32, width: 0.24, height: 0.32 },
              printfulPlacement: "sleeve_left",
              defaultScale: 0.54,
            },
            {
              id: "sleeve_right",
              label: "Right sleeve",
              printArea: { x: 0.7, y: 0.32, width: 0.24, height: 0.32 },
              printfulPlacement: "sleeve_right",
              defaultScale: 0.54,
            },
          ],
          printful: {
            productId: 146,
            placement: "front",
            variantIdsByColor: {
              Black: 5531,
              Navy: 5595,
              White: 5523,
              "Sport Grey": 5611,
              "*": 5531,
            },
          },
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
          placements: [
            {
              id: "front",
              label: "Front",
              printArea: { x: 0.22, y: 0.22, width: 0.56, height: 0.46 },
              printfulPlacement: "front",
              defaultScale: 0.78,
            },
            {
              id: "back",
              label: "Back",
              printArea: { x: 0.22, y: 0.22, width: 0.56, height: 0.46 },
              printfulPlacement: "back",
              defaultScale: 0.78,
            },
            {
              id: "sleeve_left",
              label: "Left sleeve",
              printArea: { x: 0.06, y: 0.32, width: 0.24, height: 0.32 },
              printfulPlacement: "sleeve_left",
              defaultScale: 0.54,
            },
            {
              id: "sleeve_right",
              label: "Right sleeve",
              printArea: { x: 0.7, y: 0.32, width: 0.24, height: 0.32 },
              printfulPlacement: "sleeve_right",
              defaultScale: 0.54,
            },
          ],
          printful: {
            productId: 145,
            placement: "front",
            variantIdsByColor: {
              Black: 5438,
              Navy: 5502,
              White: 5430,
              "Sport Grey": 5518,
              Sand: 16880,
              "*": 5438,
            },
          },
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
      {
        id: "cap",
        label: "Hat (Embroidered)",
        base: "YP Classics 6245CM",
        note: "Strapback",
        sizes: ["OS"],
        colors: ["Black", "Navy", "Charcoal", "Khaki"],
        categoryId: "headwear",
        categoryLabel: "Headwear",
        mockup: {
          aspectRatio: 1,
          printArea: { x: 0.36, y: 0.26, width: 0.28, height: 0.22 },
          backgroundKind: "cap",
          baseImage: "/mockups/cap/black.png",
          colorImages: {
            Black: "/mockups/cap/black.png",
          },
          printMethod: "embroidery",
        },
      },
      {
        id: "trucker",
        label: "Trucker Cap",
        base: "YP Classics 6606",
        note: "Mesh back",
        sizes: ["OS"],
        colors: ["Black/White", "Navy/White", "Charcoal/White"],
        categoryId: "headwear",
        categoryLabel: "Headwear",
      },
      {
        id: "beanie",
        label: "Beanie",
        base: "Sportsman SP15",
        note: "Embroidered",
        sizes: ["OS"],
        colors: ["Black", "Heather Grey", "Brown"],
        categoryId: "headwear",
        categoryLabel: "Headwear",
        mockup: {
          aspectRatio: 1,
          printArea: { x: 0.38, y: 0.28, width: 0.24, height: 0.2 },
          backgroundKind: "beanie",
          baseImage: "/mockups/beanie/black.png",
          colorImages: {
            Black: "/mockups/beanie/black.png",
          },
          printMethod: "embroidery",
        },
      },
    ],
  },
  {
    id: "accessories",
    label: "Accessories",
    items: [
      {
        id: "tote",
        label: "Tote Bag",
        base: "Premium Tote",
        note: "All-over or classic",
        sizes: ["Standard", "Large"],
        colors: ["Natural", "Black"],
        categoryId: "accessories",
        categoryLabel: "Accessories",
      },
      {
        id: "backpack",
        label: "Backpack",
        base: "All-over",
        note: "Padded",
        sizes: ["Standard"],
        colors: ["Black", "Charcoal"],
        categoryId: "accessories",
        categoryLabel: "Accessories",
      },
      {
        id: "socks",
        label: "Socks",
        base: "All-over",
        note: "Crew",
        sizes: ["S/M", "L/XL"],
        colors: ["White", "Black"],
        categoryId: "accessories",
        categoryLabel: "Accessories",
      },
      {
        id: "fannypack",
        label: "Fanny Pack",
        base: "All-over",
        note: "Adjustable strap",
        sizes: ["Standard"],
        colors: ["Black", "Camo"],
        categoryId: "accessories",
        categoryLabel: "Accessories",
      },
    ],
  },
  {
    id: "drinkware",
    label: "Drinkware",
    items: [
      {
        id: "mug",
        label: "Mug",
        base: "Ceramic",
        note: "11oz / 15oz",
        sizes: ["11oz", "15oz"],
        colors: ["White", "Black rim"],
        categoryId: "drinkware",
        categoryLabel: "Drinkware",
        mockup: {
          aspectRatio: 4 / 3,
          printArea: { x: 0.18, y: 0.32, width: 0.64, height: 0.36 },
          backgroundKind: "mug",
          baseImage: "/mockups/mug/white.png",
          colorImages: {
            White: "/mockups/mug/white.png",
          },
          placements: [
            {
              id: "front",
              label: "Front",
              printArea: { x: 0.18, y: 0.32, width: 0.64, height: 0.36 },
              printfulPlacement: "front",
              defaultScale: 0.82,
            },
            {
              id: "back",
              label: "Back",
              printArea: { x: 0.18, y: 0.32, width: 0.64, height: 0.36 },
              printfulPlacement: "back",
              defaultScale: 0.82,
            },
            {
              id: "wrap",
              label: "Wrap",
              printArea: { x: 0.08, y: 0.2, width: 0.84, height: 0.52 },
              printfulPlacement: "wrap",
              defaultScale: 1.02,
            },
          ],
          maskSvgUrl: "/mockups/mug/mask.svg",
          warp: {
            src: [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ],
            dst: [
              [0.08, 0.06],
              [0.92, 0.02],
              [0.94, 0.98],
              [0.06, 0.94],
            ],
            meshDetail: 22,
          },
        },
      },
      {
        id: "tumbler",
        label: "Tumbler",
        base: "Stainless",
        note: "20oz",
        sizes: ["20oz"],
        colors: ["Silver", "White"],
        categoryId: "drinkware",
        categoryLabel: "Drinkware",
      },
      {
        id: "bottle",
        label: "Water Bottle",
        base: "Stainless",
        note: "17oz",
        sizes: ["17oz"],
        colors: ["White", "Silver"],
        categoryId: "drinkware",
        categoryLabel: "Drinkware",
      },
    ],
  },
  {
    id: "wallart",
    label: "Wall Art",
    items: [
      {
        id: "poster",
        label: "Poster",
        base: "Premium Matte",
        note: "Multiple sizes",
        sizes: ["8x10", "12x16", "18x24"],
        colors: ["Matte", "Semi-gloss"],
        categoryId: "wallart",
        categoryLabel: "Wall Art",
        mockup: {
          aspectRatio: 2 / 3,
          printArea: { x: 0.08, y: 0.06, width: 0.84, height: 0.88 },
          backgroundKind: "poster",
          baseImage: "/mockups/poster/matte.png",
          colorImages: {
            Matte: "/mockups/poster/matte.png",
          },
          printMethod: "flat",
        },
      },
      {
        id: "framed",
        label: "Framed Poster",
        base: "Matte + Frame",
        note: "Multiple sizes",
        sizes: ["8x10", "12x16", "18x24"],
        colors: ["Black frame", "White frame", "Wood frame"],
        categoryId: "wallart",
        categoryLabel: "Wall Art",
      },
      {
        id: "canvas",
        label: "Canvas",
        base: "Gallery wrap",
        note: "Multiple sizes",
        sizes: ["12x12", "16x20", "24x36"],
        colors: ["Gallery wrap"],
        categoryId: "wallart",
        categoryLabel: "Wall Art",
      },
      {
        id: "metal",
        label: "Metal Print",
        base: "Metal",
        note: "Small/Medium",
        sizes: ["12x12", "16x20"],
        colors: ["Glossy", "Matte"],
        categoryId: "wallart",
        categoryLabel: "Wall Art",
      },
    ],
  },
  {
    id: "phone",
    label: "Phone Cases",
    items: [
      {
        id: "iphone",
        label: "iPhone Case",
        base: "Tough/Glossy",
        note: "Popular models",
        sizes: ["iPhone 14", "iPhone 14 Pro", "iPhone 15", "iPhone 15 Pro"],
        colors: ["Black", "White"],
        categoryId: "phone",
        categoryLabel: "Phone Cases",
      },
      {
        id: "android",
        label: "Android Case",
        base: "Select models",
        note: "Slim/Tough",
        sizes: ["Pixel 8", "Pixel 8 Pro", "Galaxy S23", "Galaxy S23 Ultra"],
        colors: ["Black", "White"],
        categoryId: "phone",
        categoryLabel: "Phone Cases",
      },
    ],
  },
  {
    id: "stickers",
    label: "Stickers",
    items: [
      {
        id: "sticker",
        label: "Kiss-cut Sticker",
        base: "White/Transparent",
        note: "Multiple sizes",
        sizes: ["3in", "4in", "5.5in"],
        colors: ["White", "Transparent"],
        categoryId: "stickers",
        categoryLabel: "Stickers",
      },
      {
        id: "decal",
        label: "Decal",
        base: "Durable",
        note: "Indoor/Outdoor",
        sizes: ["4in", "6in", "8in"],
        colors: ["Matte", "Gloss"],
        categoryId: "stickers",
        categoryLabel: "Stickers",
      },
    ],
  },
  {
    id: "home",
    label: "Home & Living",
    items: [
      {
        id: "pillow",
        label: "Throw Pillow",
        base: "All-over",
        note: "Multiple sizes",
        sizes: ["18x18", "20x20"],
        colors: ["White", "Charcoal"],
        categoryId: "home",
        categoryLabel: "Home & Living",
      },
      {
        id: "blanket",
        label: "Blanket",
        base: "Sherpa/Fleece",
        note: "Multiple sizes",
        sizes: ["50x60", "60x80"],
        colors: ["Navy", "Grey", "White"],
        categoryId: "home",
        categoryLabel: "Home & Living",
      },
      {
        id: "deskmat",
        label: "Desk/Mouse Pad",
        base: "All-over",
        note: "Gaming sizes",
        sizes: ["18x16", "35x16"],
        colors: ["Black", "White"],
        categoryId: "home",
        categoryLabel: "Home & Living",
      },
      {
        id: "flag",
        label: "Flag",
        base: "All-over",
        note: "Multiple sizes",
        sizes: ["36x60", "60x90"],
        colors: ["White", "Black"],
        categoryId: "home",
        categoryLabel: "Home & Living",
      },
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
