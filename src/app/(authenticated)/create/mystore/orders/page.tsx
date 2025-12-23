import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import {
  CapsuleMembershipError,
  getUserCapsules,
  requireCapsuleOwnership,
  type CapsuleSummary,
} from "@/server/capsules/service";
import { listOrdersForCapsuleOwner } from "@/server/store/service";

import { StoreCapsuleGate } from "../StoreCapsuleGate";
import { StoreNavigation } from "../StoreNavigation";
import styles from "../mystore.page.module.css";

export const metadata: Metadata = {
  title: "My Store orders - Capsules",
  description: "All orders for your Capsule storefront.",
};

type MyStoreOrdersPageProps = {
  searchParams?: { capsuleId?: string; switch?: string; view?: string } | Promise<{ capsuleId?: string; switch?: string; view?: string }>;
};

type OwnerOrderEntry = Awaited<ReturnType<typeof listOrdersForCapsuleOwner>>[number];

function formatStatus(value: string) {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function toneForStatus(value: string): "success" | "warning" | "danger" | "info" {
  const normalized = value.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("canceled")) return "danger";
  if (normalized.includes("pending") || normalized.includes("requires")) return "warning";
  if (normalized.includes("succeeded") || normalized.includes("fulfilled")) return "success";
  return "info";
}

function buildFormatter(currency: string) {
  const normalized = currency && currency.trim().length ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalized,
    maximumFractionDigits: 2,
  });
}

function resolveCustomerLabel(order: OwnerOrderEntry["order"]): string {
  const candidates = [
    order.shippingName,
    order.shippingEmail,
    order.contactEmail,
    order.shippingPhone,
    order.contactPhone,
  ];
  const value = candidates.find((candidate) => candidate && candidate.trim().length)?.trim();
  return value ?? "Customer";
}

const MOCK_ORDER_ENTRIES: OwnerOrderEntry[] = [
  {
    order: {
      id: "ord_mock_1174",
      capsuleId: "cap-mock",
      buyerUserId: "buyer_mock",
      status: "fulfilled",
      paymentStatus: "succeeded",
      subtotalCents: 4599,
      taxCents: 0,
      feeCents: 500,
      totalCents: 4999,
      currency: "usd",
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      taxDetails: {},
      shippingRequired: false,
      shippingName: "Rebecca Moore",
      shippingEmail: "rebecca@example.com",
      shippingPhone: null,
      shippingAddressLine1: null,
      shippingAddressLine2: null,
      shippingCity: null,
      shippingRegion: null,
      shippingPostalCode: null,
      shippingCountry: null,
      shippingNotes: null,
      shippingStatus: "fulfilled",
      shippingTracking: null,
      shippingCarrier: null,
      createdAt: "2024-04-25T15:12:00.000Z",
      updatedAt: "2024-04-25T15:12:00.000Z",
      confirmationCode: "1174",
      metadata: {},
      completedAt: "2024-04-25T15:12:00.000Z",
      contactEmail: "rebecca@example.com",
      contactPhone: null,
    },
    items: [
      {
        id: "item_mock_1",
        orderId: "ord_mock_1174",
        productId: null,
        title: "Aurora Hoodie",
        quantity: 1,
        unitPriceCents: 4999,
        totalCents: 4999,
        taxCents: 0,
        currency: "usd",
        metadata: {},
      },
    ],
  },
  {
    order: {
      id: "ord_mock_1173",
      capsuleId: "cap-mock",
      buyerUserId: "buyer_mock",
      status: "fulfillment_pending",
      paymentStatus: "succeeded",
      subtotalCents: 8250,
      taxCents: 0,
      feeCents: 730,
      totalCents: 8850,
      currency: "usd",
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      taxDetails: {},
      shippingRequired: true,
      shippingName: "Cody Harris",
      shippingEmail: "cody@example.com",
      shippingPhone: null,
      shippingAddressLine1: null,
      shippingAddressLine2: null,
      shippingCity: null,
      shippingRegion: null,
      shippingPostalCode: null,
      shippingCountry: null,
      shippingNotes: null,
      shippingStatus: "shipped",
      shippingTracking: null,
      shippingCarrier: null,
      createdAt: "2024-04-24T17:45:00.000Z",
      updatedAt: "2024-04-24T17:45:00.000Z",
      confirmationCode: "1173",
      metadata: {},
      completedAt: null,
      contactEmail: "cody@example.com",
      contactPhone: null,
    },
    items: [
      {
        id: "item_mock_2",
        orderId: "ord_mock_1173",
        productId: null,
        title: "Galaxy Jersey",
        quantity: 2,
        unitPriceCents: 4425,
        totalCents: 8850,
        taxCents: 0,
        currency: "usd",
        metadata: {},
      },
    ],
  },
  {
    order: {
      id: "ord_mock_1172",
      capsuleId: "cap-mock",
      buyerUserId: "buyer_mock",
      status: "paid",
      paymentStatus: "succeeded",
      subtotalCents: 2300,
      taxCents: 0,
      feeCents: 200,
      totalCents: 2499,
      currency: "usd",
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      taxDetails: {},
      shippingRequired: true,
      shippingName: "Ethan Wright",
      shippingEmail: "ethan@example.com",
      shippingPhone: null,
      shippingAddressLine1: null,
      shippingAddressLine2: null,
      shippingCity: null,
      shippingRegion: null,
      shippingPostalCode: null,
      shippingCountry: null,
      shippingNotes: null,
      shippingStatus: "processing",
      shippingTracking: null,
      shippingCarrier: null,
      createdAt: "2024-04-24T09:20:00.000Z",
      updatedAt: "2024-04-24T09:20:00.000Z",
      confirmationCode: "1172",
      metadata: {},
      completedAt: null,
      contactEmail: "ethan@example.com",
      contactPhone: null,
    },
    items: [
      {
        id: "item_mock_3",
        orderId: "ord_mock_1172",
        productId: null,
        title: "Neon Keycap Set",
        quantity: 1,
        unitPriceCents: 2499,
        totalCents: 2499,
        taxCents: 0,
        currency: "usd",
        metadata: {},
      },
    ],
  },
];

export default async function MyStoreOrdersPage({ searchParams }: MyStoreOrdersPageProps) {
  const resolvedSearchParams =
    typeof searchParams === "object" &&
    searchParams !== null &&
    typeof (searchParams as Promise<unknown>).then === "function"
      ? await (searchParams as Promise<{ capsuleId?: string; switch?: string; view?: string }>)
      : ((searchParams as { capsuleId?: string; switch?: string; view?: string } | undefined) ?? {});
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/create/mystore/orders");
  }
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/create/mystore/orders");
  }

  const supabaseUserId = await ensureSupabaseUser({
    key: `clerk:${user.id}`,
    provider: "clerk",
    clerk_id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? null,
    full_name: user.fullName ?? null,
    avatar_url: user.imageUrl ?? null,
  });

  const headerList = await headers();
  const requestOrigin = deriveRequestOrigin({ headers: headerList }) ?? null;

  const ownedCapsules = (await getUserCapsules(supabaseUserId, { origin: requestOrigin })).filter(
    (capsule) => capsule.ownership === "owner",
  );
  const requestedCapsuleId = resolvedSearchParams.capsuleId?.trim() ?? null;
  const selectedCapsule: CapsuleSummary | null =
    (requestedCapsuleId
      ? ownedCapsules.find((capsule) => capsule.id === requestedCapsuleId)
      : ownedCapsules.length === 1
        ? ownedCapsules[0]
        : null) ?? null;
  const selectedCapsuleId = selectedCapsule?.id ?? null;
  const showSelector = !selectedCapsule && !requestedCapsuleId;

  let orders: OwnerOrderEntry[] = [];
  let ordersError: string | null = null;

  if (selectedCapsule) {
    try {
      await requireCapsuleOwnership(selectedCapsule.id, supabaseUserId);
      orders = await listOrdersForCapsuleOwner(selectedCapsule.id);
    } catch (error) {
      ordersError =
        error instanceof CapsuleMembershipError
          ? error.message
          : "Unable to load store orders right now.";
    }
  } else if (requestedCapsuleId) {
    ordersError = "You do not own this capsule.";
  }

  if (showSelector) {
    return (
      <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
        <div className={styles.shell} data-surface="store">
          <header className={`${styles.header} ${styles.headerBare}`}>
            <div className={styles.headerBottom}>
              <StoreCapsuleGate capsules={ownedCapsules} selectedCapsuleId={null} />
            </div>
          </header>
        </div>
      </AppPage>
    );
  }

  const currency = orders[0]?.order.currency ?? MOCK_ORDER_ENTRIES[0]?.order.currency ?? "usd";
  const formatCents = buildFormatter(currency);
  const sortedOrders = [...orders].sort(
    (a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime(),
  );
  const displayOrders = sortedOrders.length ? sortedOrders : MOCK_ORDER_ENTRIES;

  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="store">
        <header className={`${styles.header} ${styles.storeNavHeader}`}>
          <StoreNavigation
            capsuleId={selectedCapsuleId}
            capsuleName={selectedCapsule?.name ?? null}
            active="orders"
            disabled={!selectedCapsule}
          />
        </header>

        <main className={styles.ordersPage} aria-label="Store orders">
          <section className={`${styles.card} ${styles.ordersCard}`}>
            <header className={styles.ordersHeaderRow}>
              <div>
                <h1 className={styles.ordersTitle}>Orders</h1>
                <p className={styles.ordersSubtitle}>
                  {selectedCapsule
                    ? "All orders from your Capsule store, newest first."
                    : "Choose a capsule to view store orders."}
                </p>
              </div>
            </header>

            <div className={styles.ordersSearchRow}>
              <div className={styles.ordersSearch} aria-hidden="true">
                <input
                  type="search"
                  placeholder="Search orders..."
                  className={styles.ordersSearchInput}
                  disabled
                />
              </div>
            </div>

            {ordersError ? (
              <div className={styles.emptyCard}>
                <p>{ordersError}</p>
              </div>
            ) : !selectedCapsule ? (
              <div className={styles.emptyCard}>
                <p>Select a capsule above to view orders.</p>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.tableHeaderCell}>Order</th>
                    <th className={styles.tableHeaderCell}>Date</th>
                    <th className={styles.tableHeaderCell}>Customer</th>
                    <th className={styles.tableHeaderCell}>Status</th>
                    <th className={styles.tableHeaderCellRight}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {displayOrders.map((entry) => {
                    const ref = entry.order.confirmationCode ?? entry.order.id.slice(0, 8);
                    const created = new Date(entry.order.createdAt);
                    const formattedDate = created.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                    const customer = resolveCustomerLabel(entry.order);
                    const statusTone = toneForStatus(entry.order.paymentStatus);
                    const displayStatus =
                      entry.order.shippingStatus && entry.order.shippingStatus.trim().length
                        ? formatStatus(entry.order.shippingStatus)
                        : formatStatus(entry.order.paymentStatus);

                    return (
                      <tr key={entry.order.id}>
                        <td className={styles.tableCellMuted}>#{ref}</td>
                        <td className={styles.tableCellMuted}>{formattedDate}</td>
                        <td className={styles.tableCellPrimary}>{customer}</td>
                        <td className={styles.tableCellStatus}>
                          <span className={styles.statusPill} data-tone={statusTone}>
                            {displayStatus}
                          </span>
                        </td>
                        <td className={styles.tableCellRight}>
                          {formatCents.format(entry.order.totalCents / 100)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </AppPage>
  );
}
