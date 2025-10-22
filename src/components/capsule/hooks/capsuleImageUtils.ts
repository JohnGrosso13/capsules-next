"use client";

type LoadImageOptions = {
  allowCrossOrigin?: boolean;
  label?: string;
};

const DEFAULT_ERROR_LABEL = "banner";

const CHUNK_SIZE = 0x8000;

export function loadImageElement(
  src: string,
  { allowCrossOrigin = false, label = DEFAULT_ERROR_LABEL }: LoadImageOptions = {},
): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (allowCrossOrigin) {
      img.crossOrigin = "anonymous";
    }
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Failed to load image for ${label.toLowerCase()} preview.`));
    img.src = src;
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (typeof btoa === "function") {
    let binary = "";
    for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
      const chunk = bytes.subarray(index, index + CHUNK_SIZE);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  throw new Error("Base64 encoding not supported in this environment.");
}

export function base64ToFile(base64: string, mimeType: string, filename: string): File | null {
  const normalized = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  if (!normalized) return null;

  try {
    let binary: string;
    if (typeof atob === "function") {
      binary = atob(normalized);
      const buffer = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        buffer[index] = binary.charCodeAt(index);
      }
      return new File([buffer], filename, { type: mimeType });
    }

    if (typeof Buffer !== "undefined") {
      const buffer = Buffer.from(normalized, "base64");
      return new File([buffer], filename, { type: mimeType });
    }

    console.warn("capsule banner: base64 decoding not supported in this environment");
    return null;
  } catch (error) {
    console.warn("capsule banner: failed to decode base64 image", error);
    return null;
  }
}
