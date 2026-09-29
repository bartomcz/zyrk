import { Rect, Text } from "react-konva";
import type { RectangleObject } from "../../model/objects";
import type {
  CanvasObjectDefinition,
  ObjectRendererProps,
} from "../definition";

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 120;

function RectangleObjectRenderer({
  object,
  editing,
}: ObjectRendererProps<RectangleObject>) {
  return (
    <>
      <Rect
        width={object.width}
        height={object.height}
        fill="transparent"
        stroke={object.color}
        strokeWidth={object.strokeWidth}
        strokeScaleEnabled={false}
      />
      <Text
        name="editable-text"
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
    </>
  );
}

export const rectangleObjectDefinition: CanvasObjectDefinition<RectangleObject> =
  {
    create: ({ id, center, offset }) => ({
      id,
      type: "rectangle",
      x: center.x - DEFAULT_WIDTH / 2 + offset,
      y: center.y - DEFAULT_HEIGHT / 2 + offset,
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
    Renderer: RectangleObjectRenderer,
    transform: {
      minWidth: 20,
      minHeight: 20,
      canResize: true,
      canRotate: false,
      keepRatio: false,
      withFrame: (object, frame) => ({ ...object, ...frame }),
    },
    textEditor: {
      multiline: true,
      emptyValue: "",
      resizeBehavior: "fixed",
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
