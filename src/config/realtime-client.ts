import { getAblyRealtimeClientFactory } from "@/adapters/realtime/ably/client";
import type { RealtimeClientFactory } from "@/ports/realtime";

const realtimeVendor =
  process.env.NEXT_PUBLIC_REALTIME_VENDOR ?? process.env.REALTIME_VENDOR ?? "ably";

let clientFactory: RealtimeClientFactory | null = null;

switch (realtimeVendor) {
  case "ably":
  case "":
  case undefined:
    clientFactory = getAblyRealtimeClientFactory();
    break;
  default:
    console.warn(`Unknown realtime vendor "${realtimeVendor}". Realtime disabled.`);
    clientFactory = null;
}

export function getRealtimeClientFactory(): RealtimeClientFactory | null {
  return clientFactory;
}

export function getRealtimeClientVendor(): string {
  return realtimeVendor;
}
