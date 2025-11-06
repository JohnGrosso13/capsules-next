export function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary);
  }

  const bufferCtor = (globalThis as unknown as {
    Buffer?: { from: (input: Uint8Array) => { toString: (encoding: "base64") => string } };
  }).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(bytes).toString("base64");
  }

  throw new Error("Base64 encoding is not supported in this environment");
}

export function decodeBase64(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  const bufferCtor = (globalThis as unknown as {
    Buffer?: { from: (input: string, encoding: "base64") => Uint8Array & { buffer: ArrayBuffer; byteOffset: number; byteLength: number } };
  }).Buffer;
  if (bufferCtor) {
    const nodeBuffer = bufferCtor.from(value, "base64");
    return new Uint8Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength);
  }

  throw new Error("Base64 decoding is not supported in this environment");
}

export function encodeBase64String(value: string): string {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  const bufferCtor = (globalThis as unknown as {
    Buffer?: { from: (input: string, encoding?: string) => { toString: (encoding: "base64") => string } };
  }).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(value, "utf8").toString("base64");
  }

  throw new Error("Base64 string encoding is not supported in this environment");
}

export function extractBase64Payload(value: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed.length) {
    throw new Error("Missing base64 payload");
  }
  const commaIndex = trimmed.indexOf(",");
  return commaIndex === -1 ? trimmed : trimmed.slice(commaIndex + 1);
}

export function decodeBase64Payload(value: string): Uint8Array {
  return decodeBase64(extractBase64Payload(value));
}
