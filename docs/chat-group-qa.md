## Group Chat QA Checklist

Use this guide after deploying the latest group chat changes. Run everything in two browser sessions (A/B) signed in as different users.

### 1. Reset State (optional during development)

```bash
SUPABASE_MIGRATIONS_URL=<postgres-url> npm run db:reset:chat
```

This truncates `chat_messages`, `chat_message_reactions`, and the new group tables.

### 2. Inbox & Session Creation

1. Browser A: open **Friends → Group Chat** and create a new group with Browser B invited.
2. Confirm:
   - Group appears under Chats for both users without refresh.
   - Inbox entries show correct title, avatar fallback, and latest message preview.

### 3. Messaging & History

1. Send messages both directions.
2. Verify:
   - Messages arrive instantly on the other browser.
   - Reactions sync in both directions.
   - Refresh either browser: full history loads; message ordering preserved.

### 4. Membership Management

1. Browser A: invite a new member (use a third account or repeat with a second fake friend).
2. Browser B: receives updated participant list (no refresh).
3. Remove the member; confirm removal propagates live and that removed user loses access on refresh.

### 5. Renaming

1. In the conversation header, click the pencil icon and rename the group.
2. Confirm:
   - Title changes immediately on both browsers.
   - Inbox summary reflects the new name after reload.

### 6. Typing Indicators & Composer

1. Begin typing in Browser A; Browser B shows “X is typing…”.
2. Stop typing; indicator disappears within ~5s.

### 7. Regression Checks

- Direct messages still load history and realtime events.
- `/api/chat/messages` responds for both direct and group conversation IDs.
- No network errors in devtools console while performing steps above.
- Group owner can delete the conversation (Chat header → Delete). Other participants receive the removal event and the chat disappears without refresh.


### 8. Message Actions & Shortcuts

1. Focus any chat message from the owner account and press <kbd>Shift</kbd>+<kbd>F10</kbd> (or the Menu key) to open the message context menu without a mouse.
2. Confirm the menu shows Copy, Forward, and Delete for self messages and that each option behaves correctly:
   - Copy places the message body (and attachment metadata) on the clipboard.
   - Forward prefixes the composer with `Forwarded message:` and focuses the input.
   - Delete removes the message and dismisses the menu without errors.
3. With the message focused and no text selected, press <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Cmd</kbd>+<kbd>C</kbd> and confirm the message body is copied without opening the menu.
4. Right-click (or long-press on touch) another message to ensure the custom menu appears, and that the native browser context menu only shows when a text selection is active.

### Optional: Retention / cleanup

- Run `npm run db:prune-chat -- --days 7` and confirm messages older than the threshold no longer appear after refresh.

Complete this checklist before cutting a release. Update as new chat capabilities ship (presence, attachments, etc.).
