import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@/lib/auth/payload", () => ({
  ensureSupabaseUser: vi.fn(),
}));

vi.mock("@/server/store/service", () => ({
  createCheckoutIntent: vi.fn(),
  listViewerOrders: vi.fn(),
  listOrdersForCapsuleOwner: vi.fn(),
  saveShippingOptionForCapsule: vi.fn(),
  deleteShippingOptionForCapsule: vi.fn(),
}));

vi.mock("@/server/capsules/permissions", () => ({
  canCustomizeCapsule: vi.fn(),
  resolveCapsuleActor: vi.fn(),
}));

vi.mock("@/server/store/dashboard", () => ({
  getStoreDashboard: vi.fn(),
}));

vi.mock("@/server/capsules/service", () => {
  class CapsuleMembershipError extends Error {
    code: string;
    status: number;
    constructor(code = "forbidden", message = "Forbidden", status = 403) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    CapsuleMembershipError,
    requireCapsuleOwnership: vi.fn(),
  };
});

import { POST as checkoutPost } from "@/app/api/store/checkout-intent/route";
import { GET as ordersGet } from "@/app/api/store/orders/route";
import {
  POST as shippingPost,
  DELETE as shippingDelete,
} from "@/app/api/store/shipping-options/route";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import {
  createCheckoutIntent,
  listOrdersForCapsuleOwner,
  listViewerOrders,
  saveShippingOptionForCapsule,
  deleteShippingOptionForCapsule,
} from "@/server/store/service";
import { canCustomizeCapsule, resolveCapsuleActor } from "@/server/capsules/permissions";
import { getStoreDashboard } from "@/server/store/dashboard";
import { CapsuleMembershipError, requireCapsuleOwnership } from "@/server/capsules/service";
import { GET as dashboardGet } from "@/app/api/store/dashboard/route";

describe("store routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: "u1" } as Awaited<ReturnType<typeof auth>>);
    vi.mocked(currentUser).mockResolvedValue({
      id: "u1",
      emailAddresses: [{ id: "e1", emailAddress: "user@example.com", verification: null, linkedTo: [], type: "email_address" }],
      fullName: "User One",
      imageUrl: "http://image",
    } as unknown as Awaited<ReturnType<typeof currentUser>>);
    vi.mocked(ensureSupabaseUser).mockResolvedValue("sb-1");
  });

  it("attaches buyerUserId for authenticated checkout intent", async () => {
    vi.mocked(createCheckoutIntent).mockResolvedValue({
      orderId: "ord1",
      paymentIntentId: "pi_1",
      clientSecret: "secret",
      subtotalCents: 1000,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 1000,
      currency: "usd",
      stripeTaxCalculationId: null,
    });

    const body = {
      capsuleId: "cap-1",
      cart: [{ productId: "p1", variantId: null, quantity: 1 }],
      contact: { email: "buyer@example.com", phone: null },
      shippingOptionId: null,
      shippingAddress: null,
      billingAddress: null,
      billingSameAsShipping: true,
      promoCode: null,
      notes: null,
      termsVersion: "v1",
      termsAcceptedAt: "2025-01-01T00:00:00.000Z",
    };

    const res = await checkoutPost(
      new Request("http://localhost/api/store/checkout-intent", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );

    expect(res.status).toBe(200);
    expect(createCheckoutIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        capsuleId: "cap-1",
        buyerUserId: "sb-1",
      }),
    );
  });

  it("returns owner orders when viewer can customize capsule", async () => {
    vi.mocked(resolveCapsuleActor).mockResolvedValue({
      capsuleId: "cap-1",
      ownerId: "owner-1",
      actorId: "sb-1",
      role: "owner",
      isOwner: true,
      capsule: { id: "cap-1", name: null },
    });
    vi.mocked(canCustomizeCapsule).mockReturnValue(true);
    vi.mocked(listOrdersForCapsuleOwner).mockResolvedValue([
      {
        order: {
          id: "ord-1",
          capsuleId: "cap-1",
          buyerUserId: null,
          status: "fulfilled",
          paymentStatus: "succeeded",
          subtotalCents: 1000,
          taxCents: 0,
          feeCents: 0,
          totalCents: 1000,
          currency: "usd",
          shippingRequired: true,
          shippingStatus: "shipped",
          shippingTracking: null,
          shippingCarrier: null,
          shippingName: null,
          shippingEmail: null,
          shippingPhone: null,
          shippingAddressLine1: null,
          shippingAddressLine2: null,
          shippingCity: null,
          shippingRegion: null,
          shippingPostalCode: null,
          shippingCountry: null,
          shippingNotes: null,
          metadata: {},
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
          confirmationCode: "CONF1234",
          stripeCheckoutSessionId: null,
          stripePaymentIntentId: null,
          taxDetails: {},
          completedAt: null,
          contactEmail: null,
          contactPhone: null,
        },
        items: [],
      },
    ]);

    const res = await ordersGet(
      new Request("http://localhost/api/store/orders?capsuleId=cap-1", {
        headers: { Accept: "application/json" },
      }),
    );

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { orders: Array<{ order: { id: string } }> };
    expect(payload.orders).toHaveLength(1);
    expect(payload.orders[0]?.order.id).toBe("ord-1");
    expect(listOrdersForCapsuleOwner).toHaveBeenCalledWith("cap-1");
    expect(listViewerOrders).not.toHaveBeenCalled();
  });

  it("blocks seller orders when user cannot customize capsule", async () => {
    vi.mocked(resolveCapsuleActor).mockResolvedValue({
      capsuleId: "cap-1",
      ownerId: "owner-1",
      actorId: "sb-1",
      role: "member",
      isOwner: false,
      capsule: { id: "cap-1", name: null },
    });
    vi.mocked(canCustomizeCapsule).mockReturnValue(false);

    const res = await ordersGet(
      new Request("http://localhost/api/store/orders?capsuleId=cap-1", {
        headers: { Accept: "application/json" },
      }),
    );

    expect(res.status).toBe(403);
    expect(listOrdersForCapsuleOwner).not.toHaveBeenCalled();
  });

  it("saves and deletes shipping options for founders", async () => {
    vi.mocked(resolveCapsuleActor).mockResolvedValue({
      capsuleId: "cap-1",
      ownerId: "owner-1",
      actorId: "sb-1",
      role: "owner",
      isOwner: true,
      capsule: { id: "cap-1", name: null },
    });
    vi.mocked(canCustomizeCapsule).mockReturnValue(true);
    vi.mocked(saveShippingOptionForCapsule).mockResolvedValue({
      id: "ship-1",
      capsuleId: "cap-1",
      label: "Express",
      detail: "Fast",
      priceCents: 500,
      currency: "usd",
      etaMinDays: 2,
      etaMaxDays: 3,
      active: true,
      sortOrder: 0,
      metadata: {},
      createdAt: "",
      updatedAt: "",
    });

    const saveRes = await shippingPost(
      new Request("http://localhost/api/store/shipping-options", {
        method: "POST",
        body: JSON.stringify({
          capsuleId: "cap-1",
          option: { label: "Express", detail: "Fast", price: 5, currency: "usd" },
        }),
      }),
    );

    expect(saveRes.status).toBe(200);
    expect(saveShippingOptionForCapsule).toHaveBeenCalledWith(
      expect.objectContaining({
        capsuleId: "cap-1",
        option: expect.objectContaining({ priceCents: 500 }),
      }),
    );

    const deleteRes = await shippingDelete(
      new Request("http://localhost/api/store/shipping-options", {
        method: "DELETE",
        body: JSON.stringify({ capsuleId: "cap-1", optionId: "ship-1" }),
      }),
    );
    expect(deleteRes.status).toBe(200);
    expect(deleteShippingOptionForCapsule).toHaveBeenCalledWith("cap-1", "ship-1");
  });

  it("returns dashboard metrics for capsule owners", async () => {
    vi.mocked(requireCapsuleOwnership).mockResolvedValue({
      capsule: {
        id: "cap-1",
        name: "Cap One",
        slug: null,
        banner_url: null,
        store_banner_url: null,
        promo_tile_url: null,
        logo_url: null,
        membership_policy: null,
        created_by_id: "sb-1",
        created_at: null,
      },
      ownerId: "sb-1",
    });
    vi.mocked(getStoreDashboard).mockResolvedValue({
      capsuleId: "cap-1",
      currency: "usd",
      summary: {
        grossLast30Cents: 12000,
        netLast30Cents: 9000,
        totalOrders: 3,
        openOrders: 1,
        inTransitOrders: 1,
        fulfilledOrders: 1,
        failedOrders: 0,
        pendingPayment: 0,
        lastOrderAt: "2025-01-01T00:00:00.000Z",
      },
      recentOrders: [],
      catalog: [],
    });

    const res = await dashboardGet(
      new Request("http://localhost/api/store/dashboard?capsuleId=cap-1", {
        headers: { Accept: "application/json" },
      }),
    );

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { summary?: { totalOrders?: number } };
    expect(payload.summary?.totalOrders).toBe(3);
    expect(getStoreDashboard).toHaveBeenCalledWith("cap-1");
    expect(requireCapsuleOwnership).toHaveBeenCalledWith("cap-1", "sb-1");
  });

  it("blocks dashboard when user is not owner", async () => {
    vi.mocked(requireCapsuleOwnership).mockRejectedValue(new CapsuleMembershipError("forbidden", "Nope", 403));

    const res = await dashboardGet(
      new Request("http://localhost/api/store/dashboard?capsuleId=cap-1", {
        headers: { Accept: "application/json" },
      }),
    );

    expect(res.status).toBe(403);
    expect(getStoreDashboard).not.toHaveBeenCalled();
  });
});
