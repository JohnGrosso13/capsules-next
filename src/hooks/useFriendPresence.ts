import * as React from "react";

export type PresenceStatus = "online" | "offline" | "away" | undefined;

/**
 * Returns a stable function that maps a presence status to a CSS class
 * from the provided styles module.
 */
export function useFriendPresence(styles: { online: string; offline: string; away?: string }) {
  const getClass = React.useCallback(
    (status: PresenceStatus) => {
      if (status === "online") return styles.online;
      if (status === "away") return styles.away ?? styles.online;
      return styles.offline;
    },
    [styles],
  );

  return { presenceClass: getClass } as const;
}
