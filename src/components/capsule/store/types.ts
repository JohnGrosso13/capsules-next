export type StoreViewMode = "founder" | "visitor";

export type StoreProductVariant = {
  id: string;
  label: string;
  price: number | null;
  inventoryCount: number | null;
};

export type StoreProduct = {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string | null;
  memoryId?: string | null;
  featured: boolean;
  order: number;
  salesCount: number;
  createdAt: string;
  active: boolean;
  kind: "digital" | "physical" | "service";
  fulfillmentKind: "download" | "ship" | "external";
  inventoryCount: number | null;
  fulfillmentUrl: string | null;
  variants: StoreProductVariant[];
};

export type StoreProductDraft = {
  id: string;
  title: string;
  description: string;
  price: string;
  imageUrl: string | null;
  memoryId: string | null;
  active: boolean;
  featured: boolean;
  kind: StoreProduct["kind"];
  fulfillmentKind: StoreProduct["fulfillmentKind"];
  inventoryCount: number | null;
  fulfillmentUrl: string | null;
  variants: StoreProductVariant[];
};

export type CheckoutStep = "shipping" | "billing" | "review" | "confirmation";

export type ShippingOption = {
  id: string;
  label: string;
  price: number;
  detail: string;
};

export type PaymentOption = {
  id: string;
  label: string;
  detail: string;
};

export type CheckoutDetails = {
  email: string;
  phone: string;
  fullName: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
  shippingOption: string;
  paymentMethod: string;
  promoCode: string;
  notes: string;
  termsAccepted: boolean;
  cardName: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  billingSameAsShipping: boolean;
  billingName: string;
  billingAddress1: string;
  billingAddress2: string;
  billingCity: string;
  billingRegion: string;
  billingPostal: string;
  billingCountry: string;
};

export type StoreCartItem = {
  key: string;
  product: StoreProduct;
  variant: StoreProductVariant | null;
  quantity: number;
  unitPrice: number;
};

export type BillingSnapshot = {
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  region: string | null;
  postal: string | null;
  country: string | null;
};
