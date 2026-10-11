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
    const service = createAutomationService(() => activeDocument, () => {});

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
          message: "Expected a supported version 1 automation request",
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

test("canvas.object.add uses editor defaults and document history", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent" });

  try {
    const { createCanvasDocument } = await vite.ssrLoadModule(
      "/src/editor/model/document.ts",
    );
    const { createAutomationService } = await vite.ssrLoadModule(
      "/src/editor/state/automation.ts",
    );
    const { createDocumentHistory, documentHistoryReducer } =
      await vite.ssrLoadModule("/src/editor/state/history.ts");
    let history = createDocumentHistory(createCanvasDocument());
    const service = createAutomationService(
      () => history.present,
      (command) => {
        history = documentHistoryReducer(history, {
          type: "history/apply",
          command,
          occurredAt: "2025-01-01T00:00:00.000Z",
        });
      },
    );

    const response = service.execute({
      apiVersion: 1,
      operation: "canvas.object.add",
      objectType: "text",
      center: { x: 100, y: 200 },
      text: " Hello ",
    });

    assert.equal(response.ok, true);
    assert.equal(response.operation, "canvas.object.add");
    assert.equal(response.object.type, "text");
    assert.equal(response.object.text, "Hello");
    assert.equal(response.object.x + response.object.width / 2, 100);
    assert.equal(response.object.y + response.object.height / 2, 200);
    assert.equal(history.present.objects[response.object.id].text, "Hello");
    assert.equal(history.past.length, 1);

    history = documentHistoryReducer(history, {
      type: "history/undo",
      occurredAt: "2025-01-01T00:00:01.000Z",
    });
    assert.equal(history.present.objects[response.object.id], undefined);

    const rectangle = service.execute({
      apiVersion: 1,
      operation: "canvas.object.add",
      objectType: "rectangle",
      center: { x: -10, y: 20 },
    });
    assert.equal(rectangle.ok, true);
    assert.equal(rectangle.object.type, "rectangle");
    assert.equal(rectangle.object.text, "");

    assert.deepEqual(
      service.execute({
        apiVersion: 1,
        operation: "canvas.object.add",
        objectType: "text",
        center: { x: 0, y: 0 },
      }),
      {
        ok: false,
        apiVersion: 1,
        error: {
          code: "invalid_request",
          message: "Expected a supported version 1 automation request",
        },
      },
    );
  } finally {
    await vite.close();
  }
});

test("canvas.connection.add connects existing objects through history", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent" });

  try {
    const { createCanvasDocument } = await vite.ssrLoadModule(
      "/src/editor/model/document.ts",
    );
    const { createCanvasObject } = await vite.ssrLoadModule(
      "/src/editor/objects/registry.ts",
    );
    const { createAutomationService } = await vite.ssrLoadModule(
      "/src/editor/state/automation.ts",
    );
    const { createDocumentHistory, documentHistoryReducer } =
      await vite.ssrLoadModule("/src/editor/state/history.ts");
    const source = createCanvasObject("rectangle", {
      id: "source",
      center: { x: 0, y: 0 },
    });
    const target = createCanvasObject("rectangle", {
      id: "target",
      center: { x: 200, y: 0 },
    });
    let history = createDocumentHistory(
      createCanvasDocument([source, target]),
    );
    const service = createAutomationService(
      () => history.present,
      (command) => {
        history = documentHistoryReducer(history, {
          type: "history/apply",
          command,
          occurredAt: "2025-01-01T00:00:00.000Z",
        });
      },
    );

    const response = service.execute({
      apiVersion: 1,
      operation: "canvas.connection.add",
      from: { objectId: "source", edge: "right" },
      to: { objectId: "target", edge: "left" },
    });

    assert.equal(response.ok, true);
    assert.equal(response.operation, "canvas.connection.add");
    assert.deepEqual(history.present.connections, [response.connection]);
    assert.deepEqual(response.connection.from, {
      objectId: "source",
      edge: "right",
    });
    assert.deepEqual(response.connection.to, {
      objectId: "target",
      edge: "left",
    });
    assert.equal(history.past.length, 1);

    for (const request of [
      {
        apiVersion: 1,
        operation: "canvas.connection.add",
        from: { objectId: "source", edge: "center" },
        to: { objectId: "target", edge: "left" },
      },
      {
        apiVersion: 1,
        operation: "canvas.connection.add",
        from: { objectId: "source", edge: "right" },
        to: { objectId: "missing", edge: "left" },
      },
      {
        apiVersion: 1,
        operation: "canvas.connection.add",
        from: { objectId: "source", edge: "right" },
        to: { objectId: "source", edge: "left" },
      },
    ]) {
      assert.equal(service.execute(request).ok, false);
    }
    assert.equal(history.present.connections.length, 1);
  } finally {
    await vite.close();
  }
});
