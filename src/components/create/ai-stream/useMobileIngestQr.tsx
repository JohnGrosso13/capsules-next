"use client";

import * as React from "react";

type MobileIngestQrResult = {
  qrImageDataUrl: string | null;
  qrGenerating: boolean;
  qrError: string | null;
};

export function useMobileIngestQr(payload: string | null): MobileIngestQrResult {
  const [qrImageDataUrl, setQrImageDataUrl] = React.useState<string | null>(null);
  const [qrGenerating, setQrGenerating] = React.useState(false);
  const [qrError, setQrError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!payload) {
      setQrImageDataUrl(null);
      setQrError(null);
      setQrGenerating(false);
      return;
    }
    let cancelled = false;
    setQrGenerating(true);
    setQrError(null);
    void import("qrcode")
      .then((QRCode) => QRCode.toDataURL(payload, { margin: 1, width: 240 }))
      .then((dataUrl) => {
        if (cancelled) return;
        setQrImageDataUrl(dataUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("mux.mobileIngest.qr", error);
        setQrImageDataUrl(null);
        setQrError("Unable to generate a mobile ingest QR code.");
      })
      .finally(() => {
        if (cancelled) return;
        setQrGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return { qrImageDataUrl, qrGenerating, qrError };
}
