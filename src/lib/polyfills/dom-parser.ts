// Provide a minimal DOMParser so server/edge code that expects it can run.
if (typeof (globalThis as { DOMParser?: unknown }).DOMParser !== "function") {
  class BasicDOMParser {
    parseFromString(markup: string) {
      const textContent = String(markup ?? "");
      const node = { textContent, innerHTML: textContent };
      return {
        textContent,
        documentElement: node,
        body: node,
      } as unknown;
    }
  }

  Object.defineProperty(globalThis, "DOMParser", {
    value: BasicDOMParser,
    configurable: true,
    writable: true,
  });
}

export {};

