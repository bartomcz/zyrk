import type { TextObject } from "../../model/objects";
import type { CanvasObjectBehavior } from "../behavior";

export const DEFAULT_TEXT_FONT_SIZE = 28;
export const DEFAULT_TEXT_HEIGHT = DEFAULT_TEXT_FONT_SIZE;
const MIN_TEXT_WIDTH = 40;
const MIN_TEXT_HEIGHT = 24;

export const textObjectBehavior: CanvasObjectBehavior<TextObject> = {
  create: ({ id, center }) => ({
    id,
    type: "text",
    text: "",
    autoWidth: true,
    x: center.x - MIN_TEXT_WIDTH / 2,
    y: center.y - DEFAULT_TEXT_HEIGHT / 2,
    width: MIN_TEXT_WIDTH,
    height: DEFAULT_TEXT_HEIGHT,
    rotation: 0,
    fontSize: DEFAULT_TEXT_FONT_SIZE,
    fontFamily: "sans-serif",
    textColor: "#171717",
    textAlign: "center",
  }),
  transform: {
    minWidth: MIN_TEXT_WIDTH,
    minHeight: MIN_TEXT_HEIGHT,
    keepRatio: true,
    textResize: "reflow-horizontal",
    reflowHeight: (object, width, measureTextHeight) =>
      Math.max(
        MIN_TEXT_HEIGHT,
        measureTextHeight({
          text: object.text,
          width,
          fontSize: object.fontSize,
          fontFamily: object.fontFamily,
        }),
      ),
    withFrame: (object, frame, resizeMode) => ({
      ...object,
      ...frame,
      autoWidth: object.autoWidth && frame.width === object.width,
      fontSize:
        resizeMode === "reflow"
          ? object.fontSize
          : object.fontSize * (frame.height / object.height),
    }),
  },
  textEditor: {
    getValue: (object) => object.text,
    update: (object, value, contentWidth, contentHeight) => {
      const width = object.autoWidth
        ? Math.max(MIN_TEXT_WIDTH, contentWidth)
        : object.width;
      const height =
        !object.autoWidth && contentWidth <= object.width
          ? Math.max(MIN_TEXT_HEIGHT, object.fontSize * value.split("\n").length)
          : Math.max(MIN_TEXT_HEIGHT, object.fontSize, contentHeight);
      return value === object.text &&
        width === object.width &&
        height === object.height
        ? object
        : {
            ...object,
            text: value,
            x: object.x + (object.width - width) / 2,
            width,
            height,
          };
    },
    finish: (object) => {
      const text = object.text.trim();
      if (!text) return null;
      return text === object.text ? object : { ...object, text };
    },
  },
};
