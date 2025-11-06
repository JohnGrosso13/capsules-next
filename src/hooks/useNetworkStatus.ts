"use client";

import * as React from "react";

export function useNetworkStatus(): boolean {
  const getOnlineStatus = React.useCallback(
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
    [],
  );

  const [isOnline, setIsOnline] = React.useState<boolean>(getOnlineStatus);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
