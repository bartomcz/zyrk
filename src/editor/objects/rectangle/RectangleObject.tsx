import { Rect, Text } from "react-konva";
import type { RectangleObject } from "../../model/objects";
import {
  EDITABLE_TEXT_NODE_NAME,
  type CanvasObjectPresentation,
  type ObjectRendererProps,
} from "../definition";

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
    </>
  );
}

export const rectangleObjectPresentation: CanvasObjectPresentation<RectangleObject> =
  {
    Renderer: RectangleObjectRenderer,
    textEditor: {
      getStyle: (object) => ({
        color: object.textColor,
        fontFamily: object.fontFamily,
        fontSize: `${object.fontSize}px`,
        textAlign: object.textAlign,
      }),
    },
  };
