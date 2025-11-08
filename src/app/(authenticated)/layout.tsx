import type { ReactNode } from "react";

import { AuthenticatedApp } from "@/components/providers/AuthenticatedApp";
import { ensureUserSession } from "@/server/actions/session";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await ensureUserSession().catch((error) => {
    console.error("AuthenticatedLayout ensureUserSession failed", error);
    return null;
  });

  return (
    <AuthenticatedApp supabaseUserId={session?.supabaseUserId ?? null}>
      {children}
    </AuthenticatedApp>
  );
}
