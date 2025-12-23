import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

import { AppPage } from "@/components/app-page";
import { ProductWizardMock } from "@/components/create/products/ProductWizardMock";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import {
  CapsuleMembershipError,
  getUserCapsules,
  type CapsuleSummary,
} from "@/server/capsules/service";
import { loadStoreCatalog } from "@/server/store/service";

import { StoreCapsuleGate } from "../StoreCapsuleGate";
import { StoreNavigation } from "../StoreNavigation";
import styles from "../mystore.page.module.css";

export const metadata: Metadata = {
  title: "My Store products - Capsules",
  description: "Manage and feature products for your Capsule storefront.",
};

type RawSearchParams = { capsuleId?: string; switch?: string; view?: string };
type MyStoreProductsPageProps = { searchParams?: RawSearchParams | Promise<RawSearchParams> };

function buildFormatter(currency: string) {
  const normalized = currency && currency.trim().length ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalized,
    maximumFractionDigits: 2,
    maximumSignificantDigits: 6,
  });
}

const MOCK_PRODUCTS = [
  {
    id: "prod_mock_aurora",
    title: "Aurora Hoodie",
    priceCents: 4999,
    currency: "usd",
    active: true,
    featured: true,
    kind: "physical",
    fulfillmentKind: "ship",
    sortOrder: 1,
  },
  {
    id: "prod_mock_galaxy",
    title: "Galaxy Jersey",
    priceCents: 4425,
    currency: "usd",
    active: true,
    featured: false,
    kind: "physical",
    fulfillmentKind: "ship",
    sortOrder: 2,
  },
  {
    id: "prod_mock_neon",
    title: "Neon Keycap Set",
    priceCents: 2499,
    currency: "usd",
    active: false,
    featured: false,
    kind: "physical",
    fulfillmentKind: "ship",
    sortOrder: 3,
  },
];

export default async function MyStoreProductsPage({ searchParams }: MyStoreProductsPageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/create/mystore/products");
  }
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/create/mystore/products");
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
  const resolvedSearchParams =
    typeof searchParams === "object" &&
    searchParams !== null &&
    typeof (searchParams as Promise<unknown>).then === "function"
      ? await searchParams
      : ((searchParams as RawSearchParams | undefined) ?? {});
  const requestedCapsuleId = resolvedSearchParams.capsuleId?.trim() ?? null;
  const selectedCapsule: CapsuleSummary | null =
    (requestedCapsuleId
      ? ownedCapsules.find((capsule) => capsule.id === requestedCapsuleId)
      : ownedCapsules.length === 1
        ? ownedCapsules[0]
        : null) ?? null;
  const selectedCapsuleId = selectedCapsule?.id ?? null;
  const showSelector = !selectedCapsule && !requestedCapsuleId;

  let catalogProducts: Awaited<ReturnType<typeof loadStoreCatalog>>["products"] = [];
  let catalogError: string | null = null;

  if (selectedCapsule) {
    try {
      const catalog = await loadStoreCatalog(selectedCapsule.id);
      catalogProducts = catalog.products ?? [];
    } catch (error) {
      catalogError =
        error instanceof CapsuleMembershipError
          ? error.message
          : "Unable to load store products right now.";
    }
  } else if (requestedCapsuleId) {
    catalogError = "You do not own this capsule.";
  }

  const currency = catalogProducts[0]?.currency ?? MOCK_PRODUCTS[0]?.currency ?? "usd";
  const formatCents = buildFormatter(currency);
  const sortedProducts = [...catalogProducts].sort((a, b) => a.sortOrder - b.sortOrder);
  const displayProducts = sortedProducts.length ? sortedProducts : MOCK_PRODUCTS;

  const manageHref = selectedCapsuleId ? `/capsule?capsuleId=${selectedCapsuleId}&tab=store` : "#";
  const productEditorBase = "/create/mystore/products/editor";
  const productEditorHref = selectedCapsuleId
    ? `${productEditorBase}?capsuleId=${selectedCapsuleId}`
    : "#";

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

  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="store">
        <header className={`${styles.header} ${styles.storeNavHeader}`}>
          <StoreNavigation
            capsuleId={selectedCapsuleId}
            capsuleName={selectedCapsule?.name ?? null}
            active="products"
            disabled={!selectedCapsule}
          />
        </header>

        <main className={styles.ordersPage} aria-label="Store products">
          <section className={`${styles.card} ${styles.ordersCard}`}>
            <header className={styles.ordersHeaderRow}>
              <div>
                <h1 className={styles.ordersTitle}>Products</h1>
                <p className={styles.ordersSubtitle}>
                  Choose which products to feature and keep your catalog up to date.
                </p>
              </div>
              <div className={styles.headerActions}>
                <Link
                  href={selectedCapsule ? productEditorHref : "#"}
                  className={styles.newProductButton}
                  aria-disabled={!selectedCapsule}
                  data-disabled={!selectedCapsule ? "true" : undefined}
                  tabIndex={!selectedCapsule ? -1 : undefined}
                >
                  + Add product
                </Link>
              </div>
            </header>

            {catalogError ? (
              <div className={styles.emptyCard}>
                <p>{catalogError}</p>
              </div>
            ) : !selectedCapsule ? (
              <div className={styles.emptyCard}>
                <p>Select a capsule above to view products.</p>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.tableHeaderCell}>Product</th>
                    <th className={styles.tableHeaderCellRight}>Price</th>
                    <th className={styles.tableHeaderCellRight}>Kind</th>
                    <th className={styles.tableHeaderCellRight}>Status</th>
                    <th className={styles.tableHeaderCellRight}>Featured</th>
                  </tr>
                </thead>
                <tbody>
                  {displayProducts.map((item) => (
                    <tr key={item.id}>
                      <td className={styles.tableCellPrimary}>{item.title}</td>
                      <td className={styles.tableCellRight}>
                        <span className={styles.pricePositive}>
                          {formatCents.format(item.priceCents / 100)}
                        </span>
                      </td>
                      <td className={styles.tableCellRight}>{item.fulfillmentKind}</td>
                      <td className={styles.tableCellRight}>
                        <span
                          className={styles.productStatus}
                          data-status={item.active ? "live" : "draft"}
                        >
                          {item.active ? "Live" : "Draft"}
                        </span>
                      </td>
                      <td className={styles.tableCellRight}>
                        <span
                          className={styles.productStatus}
                          data-status={item.featured ? "live" : "draft"}
                        >
                          {item.featured ? "Featured" : "Standard"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <ProductWizardMock
            manageHref={manageHref}
            builderHref={productEditorBase}
            capsuleId={selectedCapsuleId}
            disabled={!selectedCapsule}
          />
        </main>
      </div>
    </AppPage>
  );
}
