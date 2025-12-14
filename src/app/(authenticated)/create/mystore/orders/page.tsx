import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import {
  CapsuleMembershipError,
  getUserCapsules,
  requireCapsuleOwnership,
} from "@/server/capsules/service";
import { listOrdersForCapsuleOwner } from "@/server/store/service";

import styles from "../mystore.page.module.css";

export const metadata: Metadata = {
  title: "My Store orders - Capsules",
  description: "All orders for your Capsule storefront.",
};

type MyStoreOrdersPageProps = { searchParams?: { capsuleId?: string } };

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

  const ownedCapsules = (await getUserCapsules(supabaseUserId)).filter(
    (capsule) => capsule.ownership === "owner",
  );
  const requestedCapsuleId = searchParams?.capsuleId?.trim() ?? null;
  const selectedCapsule =
    (requestedCapsuleId ? ownedCapsules.find((capsule) => capsule.id === requestedCapsuleId) : null) ??
    ownedCapsules[0] ??
    null;
  const selectedCapsuleLogo =
    selectedCapsule?.logoUrl && selectedCapsule.logoUrl.trim().length ? selectedCapsule.logoUrl : null;

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

  const currency = orders[0]?.order.currency ?? MOCK_ORDER_ENTRIES[0]?.order.currency ?? "usd";
  const formatCents = buildFormatter(currency);
  const sortedOrders = [...orders].sort(
    (a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime(),
  );
  const displayOrders = sortedOrders.length ? sortedOrders : MOCK_ORDER_ENTRIES;

  const manageHref = selectedCapsule ? `/capsule?capsuleId=${selectedCapsule.id}&tab=store` : "#";

  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="store">
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.brand}>
              <div className={styles.brandMark} aria-hidden="true">
                {selectedCapsuleLogo ? (
                  <Image
                    src={selectedCapsuleLogo}
                    alt={selectedCapsule?.name ? `${selectedCapsule.name} logo` : "Capsule logo"}
                    className={styles.brandMarkImage}
                    loading="lazy"
                    fill
                    sizes="32px"
                    priority={false}
                  />
                ) : null}
              </div>
              <div className={styles.brandMeta}>
                <div className={styles.brandTitle}>My Store</div>
                <div className={styles.brandSubtitle}>
                  {selectedCapsule
                    ? selectedCapsule.name ?? "Capsule store"
                    : "Choose a capsule to view orders"}
                </div>
              </div>
            </div>
            <nav className={styles.headerNav} aria-label="Store navigation">
              <button className={styles.headerNavItem} type="button">
                Home
              </button>
              <button className={styles.headerNavItem} type="button">
                Products
              </button>
              <button className={styles.headerNavItem} type="button" data-active="true">
                Orders
              </button>
              <button className={styles.headerNavItem} type="button">
                Reports
              </button>
            </nav>
            <div className={styles.headerActions}>
              <a
                href={manageHref}
                className={styles.newProductButton}
                aria-disabled={!selectedCapsule}
                data-disabled={!selectedCapsule ? "true" : undefined}
              >
                + New product
              </a>
              <button className={styles.iconButtonSimple} type="button" aria-label="Notifications">
                <span className={styles.iconDot} />
              </button>
            </div>
          </div>
          <div className={styles.headerBottom}>
            <div className={styles.capsuleSwitcher}>
              {ownedCapsules.length ? (
                ownedCapsules.map((capsule) => (
                  <a
                    key={capsule.id}
                    className={styles.chipButton}
                    data-active={capsule.id === selectedCapsule?.id ? "true" : undefined}
                    href={`?capsuleId=${capsule.id}`}
                  >
                    {capsule.name || "Untitled capsule"}
                  </a>
                ))
              ) : (
                <p className={styles.emptyHint}>
                  You don&apos;t own a capsule yet. Launch one from your Capsule page to start selling.
                </p>
              )}
            </div>
          </div>
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
                        <td>
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
