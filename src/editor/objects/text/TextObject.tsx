import { Text } from "react-konva";
import type { TextObject } from "../../model/objects";
import {
  EDITABLE_TEXT_NODE_NAME,
  type CanvasObjectDefinition,
  type ObjectRendererProps,
} from "../definition";

export const DEFAULT_TEXT_WIDTH = 240;
export const DEFAULT_TEXT_HEIGHT = 44;
export const DEFAULT_TEXT_FONT_SIZE = 28;
const MIN_TEXT_WIDTH = 40;
const MIN_TEXT_HEIGHT = 24;

function TextObjectRenderer({
  object,
  editing,
}: ObjectRendererProps<TextObject>) {
  return (
    <Text
      name={EDITABLE_TEXT_NODE_NAME}
      text={object.text}
      width={object.width}
      height={object.height}
      align={object.textAlign}
      verticalAlign="middle"
      fontSize={object.fontSize}
      fontFamily={object.fontFamily}
      fill={object.textColor}
      visible={!editing}
    />
  );
}

export const textObjectDefinition: CanvasObjectDefinition<TextObject> = {
  create: ({ id, center }) => ({
    id,
    type: "text",
    text: "Text",
    x: center.x - DEFAULT_TEXT_WIDTH / 2,
    y: center.y - DEFAULT_TEXT_HEIGHT / 2,
    width: DEFAULT_TEXT_WIDTH,
    height: DEFAULT_TEXT_HEIGHT,
    rotation: 0,
    fontSize: DEFAULT_TEXT_FONT_SIZE,
    fontFamily: "sans-serif",
    textColor: "#171717",
    textAlign: "center",
  }),
  Renderer: TextObjectRenderer,
  transform: {
    minWidth: MIN_TEXT_WIDTH,
    minHeight: MIN_TEXT_HEIGHT,
    keepRatio: true,
    textResize: "reflow-horizontal",
    withFrame: (object, frame) => ({
      ...object,
      ...frame,
      fontSize: object.fontSize * (frame.height / object.height),
    }),
  },
  textEditor: {
    getValue: (object) => object.text,
    update: (object, value, contentHeight) => {
      const height = Math.max(MIN_TEXT_HEIGHT, contentHeight);
      return value === object.text && height === object.height
        ? object
        : { ...object, text: value, height };
    },
    finish: (object) => {
      const text = object.text.trim();
      if (!text) return null;
      return text === object.text ? object : { ...object, text };
    },
    getStyle: (object) => ({
      color: object.textColor,
      fontFamily: object.fontFamily,
      fontSize: `${object.fontSize}px`,
      textAlign: object.textAlign,
    }),
  },
};
