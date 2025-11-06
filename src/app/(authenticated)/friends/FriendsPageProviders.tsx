"use client";

import {
  ComposerProvider,
  AiComposerRoot,
} from "@/components/composer/ComposerProvider";
import { FriendsDataProvider } from "@/components/providers/FriendsDataProvider";
import { PartyProvider } from "@/components/providers/PartyProvider";
import { ChatProvider } from "@/components/providers/ChatProvider";
import { FriendsClient } from "./FriendsClient";

export function FriendsPageProviders() {
  return (
    <ComposerProvider>
      <FriendsDataProvider>
        <PartyProvider>
          <ChatProvider>
            <FriendsClient />
          </ChatProvider>
        </PartyProvider>
      </FriendsDataProvider>
      <AiComposerRoot />
    </ComposerProvider>
  );
}

export default FriendsPageProviders;
