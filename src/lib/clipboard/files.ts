export function extractFileFromDataTransfer(
  dataTransfer: DataTransfer | null | undefined,
): File | null {
  if (!dataTransfer) return null;

  const { items, files } = dataTransfer;

  if (items && items.length > 0) {
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          return file;
        }
      }
    }
  }

  if (files && files.length > 0) {
    const file = files.item(0);
    if (file) {
      return file;
    }
  }

  return null;
}
