import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const closeTo = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("rotated frames can resize around their canvas center", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent" });

  try {
    const { frameFromCenter, getFrameCenter } = await vite.ssrLoadModule(
      "/src/editor/objects/geometry.ts",
    );
    const frame = {
      x: 17,
      y: -22,
      width: 180,
      height: 70,
      rotation: 37,
    };
    const center = getFrameCenter(frame);
    const resized = frameFromCenter(
      center,
      { width: 95, height: 140 },
      frame.rotation,
    );
    const resizedCenter = getFrameCenter(resized);

    closeTo(resizedCenter.x, center.x);
    closeTo(resizedCenter.y, center.y);
    assert.equal(resized.width, 95);
    assert.equal(resized.height, 140);
    assert.equal(resized.rotation, frame.rotation);
  } finally {
    await vite.close();
  }
});

test("Konva text measurement adapter maps inputs and destroys its node", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent" });

  try {
    const { createKonvaTextHeightMeasurer } = await vite.ssrLoadModule(
      "/src/editor/objects/text/konvaTextMeasurement.ts",
    );
    let configuration;
    let destroyed = false;
    const measureTextHeight = createKonvaTextHeightMeasurer((options) => {
      configuration = options;
      return {
        height: () => 84,
        destroy: () => {
          destroyed = true;
        },
      };
    });

    assert.equal(
      measureTextHeight({
        text: "Wrapped text",
        width: 120,
        fontSize: 28,
        fontFamily: "sans-serif",
      }),
      84,
    );
    assert.deepEqual(configuration, {
      text: "Wrapped text",
      width: 120,
      fontSize: 28,
      fontFamily: "sans-serif",
      wrap: "word",
    });
    assert.equal(destroyed, true);
  } finally {
    await vite.close();
  }
});
