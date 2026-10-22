import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

function measureTextHeight({ text, width, fontSize }) {
  return Math.ceil((text.length * fontSize * 0.5) / width) * fontSize;
}

function objectCenter(object) {
  const angle = (object.rotation * Math.PI) / 180;
  return {
    x:
      object.x +
      (object.width / 2) * Math.cos(angle) -
      (object.height / 2) * Math.sin(angle),
    y:
      object.y +
      (object.width / 2) * Math.sin(angle) +
      (object.height / 2) * Math.cos(angle),
  };
}

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
    const service = createAutomationService(
      () => activeDocument,
      () => {},
      measureTextHeight,
    );

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
      measureTextHeight,
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
      size: { width: 240, height: 80 },
    });
    assert.equal(rectangle.ok, true);
    assert.equal(rectangle.object.type, "rectangle");
    assert.equal(rectangle.object.text, "");
    assert.equal(rectangle.object.width, 240);
    assert.equal(rectangle.object.height, 80);
    assert.equal(rectangle.object.x + rectangle.object.width / 2, -10);
    assert.equal(rectangle.object.y + rectangle.object.height / 2, 20);

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

test("canvas.object.resize preserves centers and reflows text through history", async () => {
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
    const rectangle = {
      ...createCanvasObject("rectangle", {
        id: "rectangle",
        center: { x: 100, y: 200 },
      }),
      x: 160,
      y: 110,
      rotation: 90,
    };
    const text = {
      ...createCanvasObject("text", {
        id: "text",
        center: { x: -50, y: 75 },
      }),
      text: "A long line that wraps across several lines",
    };
    let history = createDocumentHistory(
      createCanvasDocument([rectangle, text]),
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
      measureTextHeight,
    );

    const resizedRectangle = service.execute({
      apiVersion: 1,
      operation: "canvas.object.resize",
      objectId: "rectangle",
      size: { width: 240 },
    });
    assert.equal(resizedRectangle.ok, true);
    assert.equal(resizedRectangle.object.width, 240);
    assert.equal(resizedRectangle.object.height, rectangle.height);
    assert.ok(Math.abs(objectCenter(resizedRectangle.object).x - 100) < 1e-9);
    assert.ok(Math.abs(objectCenter(resizedRectangle.object).y - 200) < 1e-9);
    assert.equal(history.past.length, 1);

    const resizedText = service.execute({
      apiVersion: 1,
      operation: "canvas.object.resize",
      objectId: "text",
      size: { width: 80 },
    });

    assert.equal(resizedText.ok, true);
    assert.equal(resizedText.object.width, 80);
    assert.equal(
      resizedText.object.height,
      measureTextHeight({ ...text, width: 80 }),
    );
    assert.equal(resizedText.object.fontSize, text.fontSize);
    assert.equal(resizedText.object.autoWidth, false);
    assert.equal(resizedText.object.x + resizedText.object.width / 2, -50);
    assert.equal(resizedText.object.y + resizedText.object.height / 2, 75);

    for (const request of [
      {
        apiVersion: 1,
        operation: "canvas.object.resize",
        objectId: "text",
        size: { height: 80 },
      },
      {
        apiVersion: 1,
        operation: "canvas.object.resize",
        objectId: "rectangle",
        size: { width: 10 },
      },
      {
        apiVersion: 1,
        operation: "canvas.object.resize",
        objectId: "rectangle",
        size: {},
      },
    ]) {
      assert.equal(service.execute(request).ok, false);
    }
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
      measureTextHeight,
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
