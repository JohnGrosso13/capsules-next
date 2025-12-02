"use client";

import { FriendsDataProvider, useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { PartyProvider } from "@/components/providers/PartyProvider";
import { ChatProvider } from "@/components/providers/ChatProvider";
import { ConnectionsRail } from "@/components/rail/ConnectionsRail";

export function ConnectionsRailIsland() {
  const friendsContext = useOptionalFriendsDataContext();

  const rail = (
    <PartyProvider>
      <ChatProvider>
        <ConnectionsRail />
      </ChatProvider>
    </PartyProvider>
  );

  return friendsContext ? rail : <FriendsDataProvider>{rail}</FriendsDataProvider>;
}

export default ConnectionsRailIsland;
