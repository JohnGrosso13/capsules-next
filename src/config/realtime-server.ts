import "server-only";

import {
  getAblyRealtimeAuthProvider,
  getAblyRealtimePublisher,
} from "@/adapters/realtime/ably/server";
import type { RealtimeAuthProvider, RealtimePublisher } from "@/ports/realtime";

const realtimeVendor = process.env.REALTIME_VENDOR ?? "ably";

let publisherInstance: RealtimePublisher | null = null;
let authProviderInstance: RealtimeAuthProvider | null = null;

switch (realtimeVendor) {
  case "ably":
  case "":
  case undefined:
    publisherInstance = getAblyRealtimePublisher();
    authProviderInstance = getAblyRealtimeAuthProvider();
    break;
  default:
    console.warn(`Unknown realtime vendor "${realtimeVendor}". Realtime disabled.`);
    publisherInstance = null;
    authProviderInstance = null;
}

export function getRealtimePublisher(): RealtimePublisher | null {
  return publisherInstance;
}

export function getRealtimeAuthProvider(): RealtimeAuthProvider | null {
  return authProviderInstance;
}

export function getRealtimeVendor(): string {
  return realtimeVendor;
}
