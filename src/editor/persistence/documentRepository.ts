import { invoke, isTauri } from "@tauri-apps/api/core";
import type { CanvasDocument } from "../model/document";
import {
  parseCanvasDocument,
  serializeCanvasDocument,
} from "../model/schema";

type OpenedDocument = {
  document: CanvasDocument;
  path: string | null;
};

function safeFilename(title: string): string {
  const filename = title
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${filename || "untitled"}.zyrk.json`;
}

function openInBrowser(): Promise<OpenedDocument | null> {
  return new Promise((resolve, reject) => {
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
          resolve({
            document: parseCanvasDocument(await file.text()),
            path: null,
          });
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
  });
}

function saveInBrowser(document: CanvasDocument) {
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
  return { saved: true, path: null };
}

export const documentFileRepository = {
  open: async () => {
    if (!isTauri()) return openInBrowser();

    const opened = await invoke<[string, string] | null>("open_document");
    return opened
      ? { path: opened[0], document: parseCanvasDocument(opened[1]) }
      : null;
  },

  save: async (document: CanvasDocument, path: string | null) => {
    if (!isTauri()) return saveInBrowser(document);

    const savedPath = await invoke<string | null>("save_document", {
      path,
      suggestedFilename: safeFilename(document.title),
      contents: serializeCanvasDocument(document),
    });
    return { saved: savedPath !== null, path: savedPath };
  },
};
