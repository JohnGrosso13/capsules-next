import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import { FriendsClient } from "./FriendsClient";

export const metadata: Metadata = {
  title: "Friends - Capsules",
  description: "Manage and view your friends.",
  robots: { index: false },
};

export default function FriendsPage() {
  return (
    <AppPage showPrompter={false}>
      <FriendsClient />
    </AppPage>
  );
}
