"use client";

import * as React from "react";

import { ChatStateMachine } from "@/components/providers/chat-store";
import type { ChatSessionDescriptor } from "@/lib/chat/events";
import type { ChatMessage } from "@/components/providers/chat-store/types";

type Snapshot = {
  messages: Array<{ id: string; body: string; authorId: string }>;
  typing: string[];
};

function describeMachine(machine: ChatStateMachine): Snapshot {
  const session = machine.getState().sessions["conversation-1"];
  const messages =
    session?.messages.map((m: ChatMessage) => ({
      id: m.id,
      body: m.body,
      authorId: m.authorId,
    })) ?? [];
  const typingEntries = Object.values(session?.typing ?? {}) as Array<{
    participant?: { id?: string | null } | null;
  }>;
  const typing = typingEntries
    .map((entry) => (entry?.participant?.id ?? "").trim())
    .filter((id): id is string => Boolean(id));
  return { messages, typing };
}

const baseDescriptor: ChatSessionDescriptor = {
  id: "conversation-1",
  type: "direct",
  title: "Playwright Chat Harness",
  avatar: null,
  createdBy: "self-user",
  participants: [
    { id: "self-user", name: "You", avatar: null },
    { id: "friend-1", name: "Friend", avatar: null },
  ],
};

export default function ChatHarnessPage() {
  const machineRef = React.useRef<ChatStateMachine | null>(null);
  const [snapshot, setSnapshot] = React.useState<Snapshot>({ messages: [], typing: [] });
  const [draft, setDraft] = React.useState("Hello from Playwright");

  React.useEffect(() => {
    if (!machineRef.current) {
      const machine = new ChatStateMachine();
      machine.setCurrentUserId("self-user");
      machine.ensureSession(baseDescriptor);
      machineRef.current = machine;
    }
    setSnapshot(describeMachine(machineRef.current));
  }, []);

  const refresh = React.useCallback(() => {
    if (!machineRef.current) return;
    setSnapshot(describeMachine(machineRef.current));
  }, []);

  const sendLocal = React.useCallback(() => {
    if (!machineRef.current) return;
    const body = draft.trim();
    if (!body) return;
    machineRef.current.addMessage(
      "conversation-1",
      {
        id: `local-${Date.now()}`,
        authorId: "self-user",
        body,
        sentAt: new Date().toISOString(),
        status: "sent",
        reactions: [],
        attachments: [],
      },
      { isLocal: true },
    );
    setDraft("");
    refresh();
  }, [draft, refresh]);

  const sendRemote = React.useCallback(() => {
    if (!machineRef.current) return;
    machineRef.current.addMessage(
      "conversation-1",
      {
        id: `remote-${Date.now()}`,
        authorId: "friend-1",
        body: "Remote hello",
        sentAt: new Date().toISOString(),
        status: "sent",
        reactions: [],
        attachments: [],
      },
      { isLocal: false },
    );
    refresh();
  }, [refresh]);

  const startTyping = React.useCallback(() => {
    if (!machineRef.current) return;
    machineRef.current.applyTypingEvent({
      type: "chat.typing",
      conversationId: "conversation-1",
      senderId: "friend-1",
      typing: true,
      participants: baseDescriptor.participants,
    });
    refresh();
  }, [refresh]);

  const clearTyping = React.useCallback(() => {
    if (!machineRef.current) return;
    machineRef.current.pruneTyping();
    refresh();
  }, [refresh]);

  const [partyStatus, setPartyStatus] = React.useState<"connected" | "disconnected" | "resumed">(
    "connected",
  );
  const [resumeToken, setResumeToken] = React.useState<string | null>(null);

  return (
    <main style={{ padding: "1.5rem", fontFamily: "sans-serif", maxWidth: 760 }}>
      <h1>Playwright Chat & Party Harness</h1>

      <section style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ddd" }}>
        <h2>Chat</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            data-testid="chat-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message"
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button type="button" onClick={sendLocal} data-testid="chat-send">
            Send
          </button>
          <button type="button" onClick={sendRemote} data-testid="chat-remote">
            Simulate remote
          </button>
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={startTyping} data-testid="chat-typing-start">
            Simulate typing
          </button>
          <button type="button" onClick={clearTyping} data-testid="chat-typing-clear">
            Clear typing
          </button>
        </div>
        <ul style={{ marginTop: "1rem", padding: 0, listStyle: "none" }}>
          {snapshot.messages.map((message) => (
            <li
              key={message.id}
              data-testid="chat-message"
              style={{ padding: "0.35rem 0", borderBottom: "1px solid #eee" }}
            >
              <strong>{message.authorId === "self-user" ? "You" : "Friend"}:</strong>{" "}
              <span>{message.body}</span>
            </li>
          ))}
        </ul>
        <div data-testid="chat-typing-indicator" style={{ marginTop: "0.5rem", minHeight: "1.25rem" }}>
          {snapshot.typing.length ? `${snapshot.typing.join(", ")} typing...` : ""}
        </div>
      </section>

      <section style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ddd" }}>
        <h2>Party resume</h2>
        <p>
          Status: <span data-testid="party-status">{partyStatus}</span>
        </p>
        <p>
          Resume token: <span data-testid="party-token">{resumeToken ?? ""}</span>
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={() => setPartyStatus("disconnected")} data-testid="party-disconnect">
            Disconnect
          </button>
          <button
            type="button"
            onClick={() => {
              setResumeToken("resume-token-123");
              setPartyStatus("resumed");
            }}
            data-testid="party-resume"
          >
            Resume party
          </button>
        </div>
      </section>
    </main>
  );
}
