"use client";

import { FriendsDataProvider, useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { PartyProvider } from "@/components/providers/PartyProvider";
import { ChatProvider } from "@/components/providers/ChatProvider";
import { ConnectionsRail } from "@/components/rail/ConnectionsRail";

export function ConnectionsRailIsland() {
  const friendsContext = useOptionalFriendsDataContext();

  const rail = (
    <PartyProvider>
      <ConnectionsRail />
    </PartyProvider>
  );

  if (friendsContext) {
    return rail;
  }

  // Fallback for surfaces that don't already provide friends/chat context.
  return (
    <FriendsDataProvider>
      <ChatProvider>{rail}</ChatProvider>
    </FriendsDataProvider>
  );
}

export default ConnectionsRailIsland;
