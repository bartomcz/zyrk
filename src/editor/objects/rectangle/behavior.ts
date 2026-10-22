import type { RectangleObject } from "../../model/objects";
import type { CanvasObjectBehavior } from "../behavior";

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 120;

export const rectangleObjectBehavior: CanvasObjectBehavior<RectangleObject> = {
  create: ({ id, center }) => ({
    id,
    type: "rectangle",
    x: center.x - DEFAULT_WIDTH / 2,
    y: center.y - DEFAULT_HEIGHT / 2,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    rotation: 0,
    color: "#171717",
    strokeWidth: 2,
    text: "",
    fontSize: 28,
    fontFamily: "sans-serif",
    textColor: "#171717",
    textAlign: "center",
  }),
  transform: {
    minWidth: 20,
    minHeight: 20,
    keepRatio: false,
    textResize: "preserve-font-size",
    withFrame: (object, frame) => ({ ...object, ...frame }),
  },
  textEditor: {
    getValue: (object) => object.text,
    update: (object, value) =>
      value === object.text ? object : { ...object, text: value },
    finish: (object) => {
      const text = object.text.trim();
      return text === object.text ? object : { ...object, text };
    },
  },
};
