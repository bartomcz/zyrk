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
    assert.equal(text.text, "");
    assert.equal(text.autoWidth, true);
    assert.equal(text.width, 40);
    assert.equal(text.height, text.fontSize);

    const singleLineText = textDefinition.textEditor.update(
      text,
      "A",
      20,
      20,
    );
    assert.equal(singleLineText.height, text.height);

    const updatedText = textDefinition.textEditor.update(
      text,
      "Updated",
      120,
      80,
    );
    assert.equal(updatedText.width, 120);
    assert.equal(updatedText.height, 80);
    assert.equal(updatedText.x + updatedText.width / 2, center.x);

    const shrunkText = textDefinition.textEditor.update(
      updatedText,
      "Short",
      50,
      30,
    );
    assert.equal(shrunkText.width, 50);
    assert.equal(shrunkText.x + shrunkText.width / 2, center.x);

    const manualText = textDefinition.transform.withFrame(
      shrunkText,
      {
        x: center.x - 120,
        y: shrunkText.y,
        width: 240,
        height: 60,
        rotation: shrunkText.rotation,
      },
      "reflow",
    );
    assert.equal(manualText.autoWidth, false);
    assert.equal(manualText.fontSize, shrunkText.fontSize);

    const wrappedText = textDefinition.textEditor.update(
      manualText,
      "A long line that wraps",
      400,
      60,
    );
    assert.equal(wrappedText.width, manualText.width);
    assert.equal(wrappedText.height, 60);

    const explicitLinesText = textDefinition.textEditor.update(
      wrappedText,
      "A\nB",
      20,
      60,
    );
    assert.equal(explicitLinesText.height, text.fontSize * 2);

    const editedResizedText = textDefinition.textEditor.update(
      explicitLinesText,
      "A",
      20,
      60,
    );
    assert.equal(editedResizedText.width, manualText.width);
    assert.equal(editedResizedText.height, text.fontSize);
    assert.equal(editedResizedText.x, manualText.x);
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
