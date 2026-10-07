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

    const { createCanvasObject } = await vite.ssrLoadModule(
      "/src/editor/objects/registry.ts",
    );
    const object = createCanvasObject("text", {
      id: "new-text",
      center: { x: 0, y: 0 },
    });
    let creation = createDocumentHistory(createCanvasDocument());
    creation = documentHistoryReducer(creation, {
      type: "history/apply",
      command: { type: "object/add", object },
      groupKey: "new-text",
      occurredAt: "2026-01-01T00:00:05.000Z",
    });
    creation = documentHistoryReducer(creation, {
      type: "history/cancel-group",
      groupKey: "new-text",
      occurredAt: "2026-01-01T00:00:06.000Z",
    });

    assert.equal(creation.present.objects[object.id], undefined);
    assert.equal(creation.past.length, 0);
  } finally {
    await vite.close();
  }
});
