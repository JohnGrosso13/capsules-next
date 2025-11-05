import type { ReactNode } from "react";

import { AuthenticatedApp } from "@/components/providers/AuthenticatedApp";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <AuthenticatedApp>{children}</AuthenticatedApp>;
}
