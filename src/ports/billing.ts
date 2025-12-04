export type BillingCheckoutSession = {
  id: string;
  url: string | null;
  subscriptionId: string | null;
  customerId: string | null;
};

export type BillingSubscription = {
  id: string;
  status: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
  metadata: Record<string, unknown>;
  priceId: string | null;
};

export type BillingWebhookEvent =
  | {
      type: "checkout.session.completed";
      session: {
        id: string;
        subscriptionId: string | null;
      };
    }
  | {
      type:
        | "customer.subscription.created"
        | "customer.subscription.updated"
        | "customer.subscription.deleted";
      subscription: BillingSubscription;
    }
  | {
      type: "invoice.payment_succeeded";
      invoice: {
        id: string | null;
        subscriptionId: string | null;
        metadata: Record<string, unknown>;
      };
    }
  | {
      type: string;
      raw: unknown;
    };

export type BillingCheckoutParams = {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  quantity?: number;
  clientReferenceId?: string | null;
  metadata?: Record<string, unknown>;
  subscriptionMetadata?: Record<string, unknown>;
  mode?: "subscription" | "payment";
};

export interface BillingAdapter {
  vendor: string;
  isConfigured(): boolean;
  createCheckoutSession(params: BillingCheckoutParams): Promise<BillingCheckoutSession>;
  parseWebhookEvent(rawBody: string, signature: string | null | undefined): BillingWebhookEvent;
  retrieveSubscription(id: string): Promise<BillingSubscription | null>;
}
