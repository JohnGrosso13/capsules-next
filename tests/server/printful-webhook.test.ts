import crypto from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindOrderById = vi.fn();
const mockUpdateOrder = vi.fn();

vi.mock("@/server/store/repository", () => ({
  assembleCartItems: vi.fn(),
  filterActiveItems: vi.fn(),
  findOrderByStripePaymentIntentId: vi.fn(),
  deleteProductById: vi.fn(),
  insertOrder: vi.fn(),
  insertOrderItems: vi.fn(),
  insertPayment: vi.fn(),
  listOrderItems: vi.fn(),
  listOrdersForBuyer: vi.fn(),
  listOrdersForCapsule: vi.fn(),
  listProductsWithVariants: vi.fn(),
  listShippingOptions: vi.fn(),
  upsertShippingOption: vi.fn(),
  deleteShippingOption: vi.fn(),
  saveProductWithVariants: vi.fn(),
  updateOrder: (...args: unknown[]) => mockUpdateOrder(...args),
  updatePaymentByIntentId: vi.fn(),
  findOrderById: (...args: unknown[]) => mockFindOrderById(...args),
  upsertPayout: vi.fn(),
}));

vi.mock("@/server/billing/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/config/email", () => ({ getEmailService: vi.fn(() => ({ send: vi.fn() })) }));
vi.mock("@/server/store/connect", () => ({ resolveConnectCharge: vi.fn() }));

const SECRET = "printful-secret";

describe("printful webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOrderById.mockReset();
    mockUpdateOrder.mockReset();
    process.env.PRINTFUL_WEBHOOK_SECRET = SECRET;
    delete process.env.PRINTFUL_V2_ENABLED;
  });

  it("verifies hex signatures with sha256 prefix", async () => {
    vi.resetModules();
    const { verifyPrintfulSignature } = await import("@/server/store/printful");
    const payload = JSON.stringify({ hello: "world" });
    const signature = crypto.createHmac("sha256", SECRET).update(payload, "utf8").digest("hex");
    expect(verifyPrintfulSignature(payload, `sha256=${signature}`)).toBe(true);
  });

  it("handles legacy webhook payloads when v2 is disabled", async () => {
    process.env.PRINTFUL_V2_ENABLED = "false";
    vi.resetModules();
    const { handlePrintfulWebhook } = await import("@/server/store/service");

    const payload = {
      data: {
        external_id: "ord-1",
        status: "shipped",
        tracking_url: "http://example.test/track",
        carrier: "UPS",
      },
    };
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");
    mockFindOrderById.mockResolvedValue({ id: "ord-1", metadata: {} });

    await handlePrintfulWebhook(rawBody, new Headers({ "X-Printful-Signature": signature }));

    expect(mockFindOrderById).toHaveBeenCalledWith("ord-1");
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      "ord-1",
      expect.objectContaining({
        shipping_status: "shipped",
        shipping_tracking: "http://example.test/track",
        shipping_carrier: "UPS",
      }),
    );
  });

  it("normalizes v2 package_shipped payloads", async () => {
    process.env.PRINTFUL_V2_ENABLED = "true";
    vi.resetModules();
    const { handlePrintfulWebhook } = await import("@/server/store/service");

    const payload = {
      type: "package_shipped",
      created: 1733873194,
      data: {
        order: {
          id: 999,
          external_id: "ord-2",
          status: "inprocess",
          shipments: [
            {
              id: 22,
              carrier: "FEDEX",
              tracking_number: "1Z999",
              tracking_url: "https://track.example/1Z999",
            },
          ],
        },
        shipment: {
          id: 22,
          carrier: "FEDEX",
          tracking_number: "1Z999",
          tracking_url: "https://track.example/1Z999",
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");
    mockFindOrderById.mockResolvedValue({ id: "ord-2", metadata: {} });

    await handlePrintfulWebhook(rawBody, new Headers({ "X-Printful-Signature": signature }));

    expect(mockFindOrderById).toHaveBeenCalledWith("ord-2");
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      "ord-2",
      expect.objectContaining({
        shipping_status: "shipped",
        shipping_tracking: "https://track.example/1Z999",
        shipping_carrier: "FEDEX",
      }),
    );
  });

  it("falls back to order status mapping when event has no shipments", async () => {
    process.env.PRINTFUL_V2_ENABLED = "true";
    vi.resetModules();
    const { handlePrintfulWebhook } = await import("@/server/store/service");

    const payload = {
      type: "order_updated",
      created: 1733873200,
      data: {
        order: {
          external_id: "ord-3",
          status: "fulfilled",
          shipments: [],
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");
    mockFindOrderById.mockResolvedValue({ id: "ord-3", metadata: {} });

    await handlePrintfulWebhook(rawBody, new Headers({ "x-printful-hmac-sha256": signature }));

    expect(mockUpdateOrder).toHaveBeenCalledWith(
      "ord-3",
      expect.objectContaining({
        shipping_status: "shipped",
      }),
    );
  });
});
