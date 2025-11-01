# Chat Service Contracts (snapshot: 2025-10-31)

This document captures the current server/client boundaries for the chat domain
prior to the planned decomposition work. It should serve as a regression
baseline while extracting new domain services or adding test coverage.

## Primary server entry points

All public chat APIs are re-exported from `src/server/chat/service.ts`:

- `sendDirectMessage` / `sendGroupMessage`: persist a message record, sanitize body + attachments, and publish realtime fan-out.
- `updateMessageAttachments` / `updateGroupMessageAttachments`: remove attachments from authored messages (group variant only).
- `deleteDirectMessage` / `deleteGroupMessage`: soft-delete messages authored by the requester and broadcast deletion events.
- `createGroupConversationSession`, `addParticipantsToGroupConversation`, `removeParticipantFromGroupConversation`, `renameGroupConversation`, `deleteGroupConversationSession`: mutate group conversation metadata.
- `getDirectConversationHistory`, `getGroupConversationHistory`, `listRecentDirectConversations`, `listRecentGroupConversations`: read models used by the inbox surfaces.
- `addMessageReaction`, `removeMessageReaction`: persist reaction edges and fan-out reaction deltas.

All functions expect sanitized identifiers (`normalizeId`) and throw
`ChatServiceError` with structured codes.

## Event payloads

The realtime publishers (`src/services/realtime/chat.ts`) now validate every
payload against the shared schemas in `src/lib/chat/events.ts`.

- `chat.message`
  ```json
  {
    "type": "chat.message",
    "conversationId": "group_123",
    "senderId": "user_42",
    "participants": [{ "id": "user_42", "name": "Taylor", "avatar": null }],
    "session": { "type": "group", "title": "Weekend Trip", "avatar": null, "createdBy": "user_42" },
    "message": {
      "id": "msg_abc",
      "body": "hello world",
      "sentAt": "2025-10-31T20:13:00.000Z",
      "reactions": [
        {
          "emoji": "\uD83D\uDC4D",
          "users": [{ "id": "user_99", "name": "Alex", "avatar": null }]
        }
      ],
      "attachments": [{
        "id": "file_1",
        "name": "photo.jpg",
        "mimeType": "image/jpeg",
        "size": 123456,
        "url": "https://cdn.example.com/photo.jpg",
        "thumbnailUrl": "https://cdn.example.com/photo-thumb.jpg",
        "storageKey": "uploads/user_42/photo.jpg",
        "sessionId": null
      }]
    }
  }
  ```

- `chat.message.update`
  ```json
  {
    "type": "chat.message.update",
    "conversationId": "group_123",
    "messageId": "msg_abc",
    "body": "edited body",
    "attachments": [],
    "participants": [{ "id": "user_42", "name": "Taylor", "avatar": null }],
    "senderId": "user_42",
    "sentAt": "2025-10-31T20:15:00.000Z",
    "session": { "type": "group", "title": "Weekend Trip", "avatar": null, "createdBy": "user_42" }
  }
  ```

- `chat.message.delete`
  ```json
  {
    "type": "chat.message.delete",
    "conversationId": "group_123",
    "messageId": "msg_abc",
    "participants": [{ "id": "user_42", "name": "Taylor", "avatar": null }],
    "session": { "type": "group", "title": "Weekend Trip", "avatar": null, "createdBy": "user_42" }
  }
  ```

- `chat.reaction`
  ```json
  {
    "type": "chat.reaction",
    "conversationId": "group_123",
    "messageId": "msg_abc",
    "emoji": "\uD83D\uDC4D",
    "action": "added",
    "actor": { "id": "user_99", "name": "Alex", "avatar": null },
    "reactions": [
      {
        "emoji": "\uD83D\uDC4D",
        "users": [
          { "id": "user_99", "name": "Alex", "avatar": null },
          { "id": "user_42", "name": "Taylor", "avatar": null }
        ]
      }
    ],
    "participants": [
      { "id": "user_42", "name": "Taylor", "avatar": null },
      { "id": "user_99", "name": "Alex", "avatar": null }
    ]
  }
  ```

- `chat.session`
  ```json
  {
    "type": "chat.session",
    "conversationId": "group_123",
    "session": {
      "id": "group_123",
      "type": "group",
      "title": "Weekend Trip",
      "avatar": null,
      "createdBy": "user_42",
      "participants": [
        { "id": "user_42", "name": "Taylor", "avatar": null },
        { "id": "user_99", "name": "Alex", "avatar": null }
      ]
    }
  }
  ```

## Shared sanitizers

- `sanitizeBody`: collapses whitespace and trims to `MAX_BODY_LENGTH` (`4_000`).
- `sanitizeAttachments`: enforces required fields, removes duplicates by id,
  trims metadata, and zeroes negative sizes.
- `sanitizeReactionEmoji`: ensures reactions contain an emoji in the
  `Extended_Pictographic` range and clamps length to 32 characters.
- `encodeMessagePayload` / `decodeMessagePayload`: canonicalize the stored
  payload format for messages.

These helpers are used on both server (write paths) and client (optimistic
updates). Prefer reusing them instead of duplicating validation logic.

## Client store surface

`src/components/providers/chat-store.ts` exposes the mutable chat state for all
client routes. Key public methods (used by components) include:

- `loadConversation`, `loadMoreHistory`: fetch and merge history.
- `insertPendingMessage`, `markMessageDelivered`, `markMessageFailed`: manage
  local optimistic message state.
- `applyMessageEvent`, `applyMessageUpdateEvent`, `applyMessageDeleteEvent`,
  `applyReactionEvent`, `applySessionEvent`: realtime handlers wired to Ably.

Future decomposition should split these responsibilities into scoped stores:
conversation state, reaction state, and session roster, so React islands can
subscribe selectively.

---

When refactoring, update this document alongside the new modules and broaden the
Vitest coverage to include contract snapshots wherever possible.