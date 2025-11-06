"use client";

import { FriendsDataProvider } from "@/components/providers/FriendsDataProvider";
import { PartyProvider } from "@/components/providers/PartyProvider";
import { ChatProvider } from "@/components/providers/ChatProvider";
import { ConnectionsRail } from "@/components/rail/ConnectionsRail";

export function ConnectionsRailIsland() {
  return (
    <FriendsDataProvider>
      <PartyProvider>
        <ChatProvider>
          <ConnectionsRail />
        </ChatProvider>
      </PartyProvider>
    </FriendsDataProvider>
  );
}

export default ConnectionsRailIsland;
