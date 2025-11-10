import {
  DEFAULT_CHAT_STORAGE_KEY,
  loadChatState,
  saveChatState,
} from "@/lib/chat/chat-storage";
import type {
  ChatStorePersistenceAdapter,
  StorageAdapter,
  StoredState,
} from "@/components/providers/chat-store/types";

export type ChatStorePersistenceOptions = {
  storage?: StorageAdapter | null;
  storageKey?: string;
  load?: typeof loadChatState;
  save?: typeof saveChatState;
};

export class ChatStorePersistence implements ChatStorePersistenceAdapter {
  private storage: StorageAdapter | null;
  private storageKey: string;
  private readonly loader: typeof loadChatState;
  private readonly saver: typeof saveChatState;

  constructor(options?: ChatStorePersistenceOptions) {
    this.storage = options?.storage ?? null;
    this.storageKey = options?.storageKey ?? DEFAULT_CHAT_STORAGE_KEY;
    this.loader = options?.load ?? loadChatState;
    this.saver = options?.save ?? saveChatState;
  }

  setStorage(storage: StorageAdapter | null): void {
    this.storage = storage;
  }

  isEnabled(): boolean {
    return Boolean(this.storage);
  }

  load(): StoredState | null {
    if (!this.storage) return null;
    return this.loader(this.storage, this.storageKey);
  }

  save(state: StoredState): void {
    if (!this.storage) return;
    this.saver(this.storage, state, this.storageKey);
  }
}
