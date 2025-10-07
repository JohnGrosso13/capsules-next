import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import cards from "@/components/home.module.css";
import { ThemeStyleCarousel } from "@/components/theme-style-carousel";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { getUserCapsules } from "@/server/capsules/service";

import layout from "./settings.module.css";
import { CapsuleSettingsSection } from "./capsules-section";

export const metadata: Metadata = {
  title: "Capsules Preferences",
  description: "Manage your account and profile.",
};

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/settings");
  }

  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/settings");
  }

  const primaryEmailId = user.primaryEmailAddressId;
  const primaryEmail = primaryEmailId
    ? user.emailAddresses.find((entry) => entry.id === primaryEmailId)?.emailAddress ?? null
    : user.emailAddresses[0]?.emailAddress ?? null;

  const fallbackFullName = [user.firstName, user.lastName]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();
  const resolvedFullName = (user.fullName ?? fallbackFullName).trim();
  const normalizedFullName = resolvedFullName.length ? resolvedFullName : null;

  const supabaseUserId = await ensureSupabaseUser({
    key: `clerk:${user.id}`,
    provider: "clerk",
    clerk_id: user.id,
    email: primaryEmail ?? null,
    full_name: normalizedFullName,
    avatar_url: user.imageUrl ?? null,
  });

  const allCapsules = await getUserCapsules(supabaseUserId);
  const ownedCapsules = allCapsules.filter((capsule) => capsule.ownership === "owner");

  return (
    <AppPage showPrompter={true}>
      <div className={layout.main}>
        <section className={layout.shell}>
          <aside className={layout.side} aria-label="Settings sections">
            <div className={layout.sideInner}>
              <strong className={layout.sideTitle}>Capsules</strong>
              <nav className={layout.sideNav}>
                <button className={layout.sideItem} disabled aria-disabled>
                  Account
                </button>
                <button
                  className={`${layout.sideItem} ${layout.sideItemActive}`}
                  aria-label="Appearance"
                >
                  Appearance
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Notifications
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Voice
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Devices
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Privacy
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Accessibility
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Advanced
                </button>
              </nav>
            </div>
          </aside>

          <div className={layout.content}>
            <section aria-label="Capsule management" className={layout.section}>
              <CapsuleSettingsSection initialCapsules={ownedCapsules} />
            </section>
            <section aria-label="Appearance settings" className={layout.section}>
              <article className={`${cards.card} ${layout.card}`}>
                <header className={cards.cardHead}>Themes</header>
                <div className={cards.cardBody}>
                  <ThemeStyleCarousel />
                </div>
              </article>
            </section>
          </div>
        </section>
      </div>
    </AppPage>
  );
}
