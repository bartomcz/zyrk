import { Text } from "react-konva";
import type { TextObject } from "../../model/objects";
import {
  EDITABLE_TEXT_NODE_NAME,
  type CanvasObjectPresentation,
  type ObjectRendererProps,
} from "../definition";

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
      wrap={object.autoWidth ? "none" : "word"}
      align={object.textAlign}
      verticalAlign="middle"
      fontSize={object.fontSize}
      fontFamily={object.fontFamily}
      fill={object.textColor}
      visible={!editing}
    />
  );
}

export const textObjectPresentation: CanvasObjectPresentation<TextObject> = {
  Renderer: TextObjectRenderer,
  textEditor: {
    getStyle: (object) => ({
      color: object.textColor,
      fontFamily: object.fontFamily,
      fontSize: `${object.fontSize}px`,
      textAlign: object.textAlign,
      whiteSpace: object.autoWidth ? "pre" : "pre-wrap",
      overflowWrap: object.autoWidth ? "normal" : "break-word",
    }),
  },
};
