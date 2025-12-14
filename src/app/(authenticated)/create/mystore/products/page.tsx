import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { ProductWizardMock } from "@/components/create/products/ProductWizardMock";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import {
  CapsuleMembershipError,
  getUserCapsules,
} from "@/server/capsules/service";
import { loadStoreCatalog } from "@/server/store/service";

import styles from "../mystore.page.module.css";

export const metadata: Metadata = {
  title: "My Store products - Capsules",
  description: "Manage and feature products for your Capsule storefront.",
};

type MyStoreProductsPageProps = { searchParams?: { capsuleId?: string } };

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
                    : "Choose a capsule to view products"}
                </div>
              </div>
            </div>
            <nav className={styles.headerNav} aria-label="Store navigation">
              <button className={styles.headerNavItem} type="button">
                Home
              </button>
              <button className={styles.headerNavItem} type="button" data-active="true">
                Products
              </button>
              <button className={styles.headerNavItem} type="button">
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
                <a
                  href={manageHref}
                  className={styles.newProductButton}
                  aria-disabled={!selectedCapsule}
                  data-disabled={!selectedCapsule ? "true" : undefined}
                >
                  + Add product
                </a>
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

          <ProductWizardMock manageHref={manageHref} disabled={!selectedCapsule} />
        </main>
      </div>
    </AppPage>
  );
}
