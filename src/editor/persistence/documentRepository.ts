import type { CanvasDocument } from "../model/document";
import {
  parseCanvasDocument,
  serializeCanvasDocument,
} from "../model/schema";

export type DocumentFileRepository = {
  open: () => Promise<CanvasDocument | null>;
  saveAs: (document: CanvasDocument) => Promise<void>;
};

function safeFilename(title: string): string {
  const filename = title
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${filename || "untitled"}.zyrk.json`;
}

export const browserDocumentFileRepository: DocumentFileRepository = {
  open: () =>
    new Promise((resolve, reject) => {
      const input = window.document.createElement("input");
      input.type = "file";
      input.accept = ".json,.zyrk.json,application/json";
      input.hidden = true;

      const cleanup = () => input.remove();

      input.addEventListener(
        "change",
        async () => {
          const file = input.files?.[0];
          if (!file) {
            cleanup();
            resolve(null);
            return;
          }

          try {
            resolve(parseCanvasDocument(await file.text()));
          } catch (error) {
            reject(error);
          } finally {
            cleanup();
          }
        },
        { once: true },
      );
      input.addEventListener(
        "cancel",
        () => {
          cleanup();
          resolve(null);
        },
        { once: true },
      );
      window.document.body.append(input);
      input.click();
    }),

  saveAs: async (document) => {
    const blob = new Blob([serializeCanvasDocument(document)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = safeFilename(document.title);
    window.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  },
};
