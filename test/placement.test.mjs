import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("object factories center objects at the requested canvas point", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent" });

  try {
    const { createCanvasObject } = await vite.ssrLoadModule(
      "/src/editor/objects/registry.ts",
    );
    const center = { x: 320, y: -140 };

    for (const type of ["text", "rectangle"]) {
      const object = createCanvasObject(type, { id: type, center });
      assert.equal(object.x + object.width / 2, center.x);
      assert.equal(object.y + object.height / 2, center.y);
    }
  } finally {
    await vite.close();
  }
});
