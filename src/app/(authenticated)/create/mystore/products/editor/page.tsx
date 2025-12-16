import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import layoutStyles from "@/components/create/competitive/CompetitiveStudioLayout.module.css";
import { ProductBuilder } from "@/components/create/products/ProductBuilder";
import { PRODUCT_CATEGORIES, findTemplateById } from "@/components/create/products/templates";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import { getUserCapsules, type CapsuleSummary } from "@/server/capsules/service";

import { StoreCapsuleGate } from "../../StoreCapsuleGate";

type ProductEditorSearchParams = { capsuleId?: string; template?: string };

type ProductEditorPageProps = { searchParams?: ProductEditorSearchParams | Promise<ProductEditorSearchParams> };

export const metadata: Metadata = {
  title: "Product editor - Capsules",
  description: "Design, price, and publish Printful-backed products with Capsule AI.",
};

export default async function ProductEditorPage({ searchParams }: ProductEditorPageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/create/mystore/products/editor");
  }
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/create/mystore/products/editor");
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

  const resolvedParams =
    typeof searchParams === "object" && searchParams !== null && typeof (searchParams as Promise<unknown>).then === "function"
      ? await (searchParams as Promise<ProductEditorSearchParams>)
      : (searchParams as ProductEditorSearchParams | undefined) ?? {};

  const ownedCapsules = (await getUserCapsules(supabaseUserId, { origin: requestOrigin })).filter(
    (capsule) => capsule.ownership === "owner",
  );
  const requestedCapsuleId = resolvedParams?.capsuleId ?? null;
  const selectedCapsule: CapsuleSummary | null =
    requestedCapsuleId && requestedCapsuleId.trim().length
      ? ownedCapsules.find((capsule) => capsule.id === requestedCapsuleId) ?? null
      : ownedCapsules[0] ?? null;

  const templateId = resolvedParams?.template ?? null;
  const defaultTemplate = PRODUCT_CATEGORIES[0]?.items[0] ?? null;
  const template = findTemplateById(templateId) ?? defaultTemplate;

  if (!selectedCapsule) {
    return (
      <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
        <div className={capTheme.theme}>
          <StoreCapsuleGate capsules={ownedCapsules} selectedCapsuleId={null} />
        </div>
      </AppPage>
    );
  }

  if (!template) {
    return (
      <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
        <div className={capTheme.theme}>
          <p style={{ padding: 24 }}>No product templates are configured yet.</p>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={`${capTheme.theme} ${layoutStyles.shellWrap}`}>
        <div className={layoutStyles.contentArea}>
          <ProductBuilder capsule={selectedCapsule} template={template} />
        </div>
      </div>
    </AppPage>
  );
}
