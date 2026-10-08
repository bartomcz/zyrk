import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("canvas.get returns a validated snapshot of the active document", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent" });

  try {
    const { createCanvasDocument } = await vite.ssrLoadModule(
      "/src/editor/model/document.ts",
    );
    const { createAutomationService } = await vite.ssrLoadModule(
      "/src/editor/state/automation.ts",
    );
    let activeDocument = createCanvasDocument([], "First");
    const service = createAutomationService(() => activeDocument);

    const first = service.execute({
      apiVersion: 1,
      operation: "canvas.get",
    });
    assert.equal(first.ok, true);
    assert.equal(first.document.title, "First");
    assert.equal(first.document.revision, 0);
    assert.equal("revision" in first, false);

    first.document.title = "Changed outside the editor";
    assert.equal(activeDocument.title, "First");

    activeDocument = { ...activeDocument, title: "Second", revision: 1 };
    const second = service.execute({
      apiVersion: 1,
      operation: "canvas.get",
    });
    assert.equal(second.ok, true);
    assert.equal(second.document.title, "Second");
    assert.equal(second.document.revision, 1);

    assert.deepEqual(
      service.execute({
        apiVersion: 1,
        operation: "canvas.get",
        unexpected: true,
      }),
      {
        ok: false,
        apiVersion: 1,
        error: {
          code: "invalid_request",
          message: "Expected a version 1 canvas.get request",
        },
      },
    );

    activeDocument = { ...activeDocument, revision: -1 };
    assert.deepEqual(
      service.execute({ apiVersion: 1, operation: "canvas.get" }),
      {
        ok: false,
        apiVersion: 1,
        error: {
          code: "internal_error",
          message: "The active canvas is invalid",
        },
      },
    );
  } finally {
    await vite.close();
  }
});
