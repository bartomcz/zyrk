import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("editing after undo clears redo history", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent" });

  try {
    const { createCanvasDocument } = await vite.ssrLoadModule(
      "/src/editor/model/document.ts",
    );
    const { createDocumentHistory, documentHistoryReducer } =
      await vite.ssrLoadModule("/src/editor/state/history.ts");
    let history = createDocumentHistory(createCanvasDocument());

    for (const [title, occurredAt] of [
      ["First", "2026-01-01T00:00:01.000Z"],
      ["Second", "2026-01-01T00:00:02.000Z"],
    ]) {
      history = documentHistoryReducer(history, {
        type: "history/apply",
        command: { type: "document/rename", title },
        occurredAt,
      });
    }
    history = documentHistoryReducer(history, {
      type: "history/undo",
      occurredAt: "2026-01-01T00:00:03.000Z",
    });

    assert.equal(history.future.length, 1);

    history = documentHistoryReducer(history, {
      type: "history/apply",
      command: { type: "document/rename", title: "Branched" },
      occurredAt: "2026-01-01T00:00:04.000Z",
    });

    assert.equal(history.present.title, "Branched");
    assert.equal(history.future.length, 0);
  } finally {
    await vite.close();
  }
});
