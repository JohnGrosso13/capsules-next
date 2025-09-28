import { Pinecone } from "@pinecone-database/pinecone";
import type { RecordMetadata, PineconeConfiguration } from "@pinecone-database/pinecone";

import { serverEnv } from "../env/server";

let pinecone: Pinecone | null = null;
let initFailed = false;

function createClient() {
  if (initFailed) return null;
  if (!serverEnv.PINECONE_API_KEY || !serverEnv.PINECONE_INDEX) {
    initFailed = true;
    return null;
  }

  if (!pinecone) {
    try {
      const options: PineconeConfiguration = { apiKey: serverEnv.PINECONE_API_KEY };
      if (serverEnv.PINECONE_CONTROLLER_HOST) {
        options.controllerHostUrl = serverEnv.PINECONE_CONTROLLER_HOST;
      }
      pinecone = new Pinecone(options);
    } catch (error) {
      initFailed = true;
      console.warn("Pinecone initialization failed", error);
      return null;
    }
  }

  return pinecone;
}

export function isPineconeEnabled() {
  return Boolean(serverEnv.PINECONE_API_KEY && serverEnv.PINECONE_INDEX);
}

export function getPineconeIndex<T extends RecordMetadata = RecordMetadata>() {
  if (!isPineconeEnabled()) return null;

  const client = createClient();
  if (!client || !serverEnv.PINECONE_INDEX) return null;

  try {
    const index = client.index<T>(serverEnv.PINECONE_INDEX);
    return serverEnv.PINECONE_NAMESPACE ? index.namespace(serverEnv.PINECONE_NAMESPACE) : index;
  } catch (error) {
    console.warn("Pinecone index access failed", error);
    initFailed = true;
    return null;
  }
}

