import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const textObject = (id, x) => ({
  id,
  type: "text",
  text: id,
  x,
  y: 20,
  width: 100,
  height: 60,
  rotation: 0,
  fontSize: 20,
  fontFamily: "sans-serif",
  textColor: "#000",
  textAlign: "center",
});

test("connections snap to edges, persist, and are removed with an endpoint", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent" });

  try {
    const { findObjectEdgeAt, getEdgePoint } = await vite.ssrLoadModule(
      "/src/editor/canvas/connections.ts",
    );
    const { createCanvasDocument } = await vite.ssrLoadModule(
      "/src/editor/model/document.ts",
    );
    const { applyDocumentCommand } = await vite.ssrLoadModule(
      "/src/editor/state/commands.ts",
    );
    const { parseCanvasDocumentValue } = await vite.ssrLoadModule(
      "/src/editor/model/schema.ts",
    );
    const source = textObject("source", 0);
    const target = textObject("target", 200);

    assert.deepEqual(getEdgePoint(target, "left"), { x: 200, y: 50 });
    assert.deepEqual(
      findObjectEdgeAt([target], { x: 204, y: 40 }, source.id, 10),
      { objectId: target.id, edge: "left" },
    );
    assert.equal(
      findObjectEdgeAt([source], { x: 0, y: 40 }, source.id, 10),
      null,
    );

    const connection = {
      id: "connection",
      from: { objectId: source.id, edge: "right" },
      to: { objectId: target.id, edge: "left" },
    };
    let document = createCanvasDocument([source, target]);
    const versionOneDocument = { ...document, schemaVersion: 1 };
    delete versionOneDocument.connections;
    assert.deepEqual(parseCanvasDocumentValue(versionOneDocument).connections, []);

    document = applyDocumentCommand(
      document,
      { type: "connection/add", connection },
      "2026-01-01T00:00:01.000Z",
    );
    assert.deepEqual(document.connections, [connection]);

    const movedConnection = {
      ...connection,
      from: { objectId: source.id, edge: "top" },
    };
    document = applyDocumentCommand(
      document,
      { type: "connection/update", connection: movedConnection },
      "2026-01-01T00:00:02.000Z",
    );
    assert.deepEqual(document.connections, [movedConnection]);

    const unchangedDocument = applyDocumentCommand(
      document,
      {
        type: "connection/update",
        connection: {
          ...movedConnection,
          to: { objectId: source.id, edge: "bottom" },
        },
      },
      "2026-01-01T00:00:03.000Z",
    );
    assert.equal(unchangedDocument, document);

    const documentWithoutConnection = applyDocumentCommand(
      document,
      { type: "connection/remove", id: connection.id },
      "2026-01-01T00:00:04.000Z",
    );
    assert.deepEqual(documentWithoutConnection.connections, []);

    document = applyDocumentCommand(
      document,
      { type: "object/remove", ids: [target.id] },
      "2026-01-01T00:00:05.000Z",
    );
    assert.deepEqual(document.connections, []);
  } finally {
    await vite.close();
  }
});
