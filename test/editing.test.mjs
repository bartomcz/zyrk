import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("object definitions own editing and resize behavior", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent" });

  try {
    const { createCanvasObject, getObjectDefinition } =
      await vite.ssrLoadModule("/src/editor/objects/registry.ts");
    const center = { x: 0, y: 0 };

    const text = createCanvasObject("text", { id: "text", center });
    const textDefinition = getObjectDefinition(text);
    const updatedText = textDefinition.textEditor.update(text, "Updated", 80);
    assert.equal(updatedText.height, 80);
    assert.equal(textDefinition.transform.textResize, "reflow-horizontal");
    assert.equal(
      textDefinition.textEditor.finish({ ...updatedText, text: "   " }),
      null,
    );

    const rectangle = createCanvasObject("rectangle", {
      id: "rectangle",
      center,
    });
    const rectangleDefinition = getObjectDefinition(rectangle);
    const updatedRectangle = rectangleDefinition.textEditor.update(
      rectangle,
      "  Label  ",
      500,
    );
    assert.equal(updatedRectangle.height, rectangle.height);
    assert.equal(
      rectangleDefinition.transform.textResize,
      "preserve-font-size",
    );
    assert.equal(
      rectangleDefinition.textEditor.finish(updatedRectangle).text,
      "Label",
    );
    assert.notEqual(
      rectangleDefinition.textEditor.finish({
        ...updatedRectangle,
        text: "   ",
      }),
      null,
    );
  } finally {
    await vite.close();
  }
});
