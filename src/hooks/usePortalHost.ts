import * as React from "react";

export function usePortalHost(className: string, active = true) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    if (!active) {
      setReady(false);
      return;
    }

    let host = hostRef.current;
    if (!host) {
      host = document.createElement("div");
      hostRef.current = host;
    }

    host.className = className;
    if (!host.parentElement) {
      document.body.appendChild(host);
    }

    setReady(true);

    return () => {
      const current = hostRef.current;
      if (current && current.parentElement) {
        current.parentElement.removeChild(current);
      }
      hostRef.current = null;
      setReady(false);
    };
  }, [className, active]);

  return {
    host: active ? hostRef.current : null,
    ready: active && ready,
  } as const;
}
