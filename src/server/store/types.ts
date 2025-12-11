import type Stripe from "stripe";

export type StoreProductKind = "digital" | "physical" | "service";
export type StoreFulfillmentKind = "download" | "ship" | "external";

export type StoreProductRecord = {
  id: string;
  capsuleId: string;
  createdBy: string | null;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  active: boolean;
  inventoryCount: number | null;
  fulfillmentKind: StoreFulfillmentKind;
  fulfillmentUrl: string | null;
  mediaUrl: string | null;
  imageUrl: string | null;
  memoryId: string | null;
  metadata: Record<string, unknown>;
  featured: boolean;
  sortOrder: number;
  salesCount: number;
  sku: string | null;
  hero: boolean;
  kind: StoreProductKind;
  createdAt: string;
  updatedAt: string;
};

export type StoreProductVariantRecord = {
  id: string;
  productId: string;
  label: string;
  priceCents: number | null;
  currency: string;
  inventoryCount: number | null;
  sku: string | null;
  active: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StoreShippingOptionRecord = {
  id: string;
  capsuleId: string;
  label: string;
  detail: string | null;
  priceCents: number;
  currency: string;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  active: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StoreOrderStatus =
  | "pending"
  | "requires_payment"
  | "paid"
  | "fulfillment_pending"
  | "fulfilled"
  | "canceled"
  | "refunded"
  | "partially_refunded";

export type StorePaymentStatus = "requires_payment" | "succeeded" | "refunded" | "failed";

export type StoreOrderRecord = {
  id: string;
  capsuleId: string | null;
  buyerUserId: string | null;
  status: StoreOrderStatus;
  paymentStatus: StorePaymentStatus;
  subtotalCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  currency: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  taxDetails: Record<string, unknown>;
  shippingRequired: boolean;
  shippingStatus: string;
  shippingName: string | null;
  shippingEmail: string | null;
  shippingPhone: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingCity: string | null;
  shippingRegion: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  shippingNotes: string | null;
  shippingCarrier: string | null;
  shippingTracking: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  confirmationCode: string | null;
};

export type StoreOrderItemRecord = {
  id: string;
  orderId: string;
  productId: string | null;
  title: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  taxCents: number;
  currency: string;
  metadata: Record<string, unknown>;
};

export type StorePaymentRecord = {
  id: string;
  orderId: string;
  provider: string;
  status: StorePaymentStatus;
  amountCents: number;
  currency: string;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  receiptUrl: string | null;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StorePayoutStatus = "pending" | "paid" | "failed";

export type StorePayoutRecord = {
  id: string;
  capsuleId: string;
  orderId: string | null;
  amountCents: number;
  feeCents: number;
  currency: string;
  status: StorePayoutStatus;
  payoutRef: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StoreConnectAccountRecord = {
  id: string;
  capsuleId: string;
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StoreCartLine = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

export type StoreAddress = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal?: string | null;
  country?: string | null;
  notes?: string | null;
};

export type TaxCalculationResult = {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  stripeCalculationId: string | null;
};

export type StripePaymentIntentResult = {
  id: string;
  clientSecret: string;
  amount: number;
  currency: string;
  latestCharge?: Stripe.Charge | null;
};
