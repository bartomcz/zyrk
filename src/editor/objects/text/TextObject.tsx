import { Text } from "react-konva";
import type { TextObject } from "../../model/objects";
import type {
  CanvasObjectDefinition,
  ObjectRendererProps,
} from "../definition";

export const DEFAULT_TEXT_WIDTH = 240;
export const DEFAULT_TEXT_HEIGHT = 44;
export const DEFAULT_TEXT_FONT_SIZE = 28;

function TextObjectRenderer({
  object,
  editing,
}: ObjectRendererProps<TextObject>) {
  return (
    <Text
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
  create: ({ id, center, offset }) => ({
    id,
    type: "text",
    text: "Text",
    x: center.x - DEFAULT_TEXT_WIDTH / 2 + offset,
    y: center.y - DEFAULT_TEXT_HEIGHT / 2 + offset,
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
    minWidth: 40,
    minHeight: 24,
    canResize: true,
    canRotate: true,
    withFrame: (object, frame) => ({
      ...object,
      ...frame,
      fontSize: object.fontSize * (frame.width / object.width),
    }),
  },
  textEditor: {
    multiline: false,
    emptyValue: "Text",
    getValue: (object) => object.text,
    withValue: (object, value) =>
      value === object.text ? object : { ...object, text: value },
    getStyle: (object) => ({
      color: object.textColor,
      fontFamily: object.fontFamily,
      fontSize: `${object.fontSize}px`,
      textAlign: object.textAlign,
    }),
  },
};
