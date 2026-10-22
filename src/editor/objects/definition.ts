import type { ComponentType, CSSProperties } from "react";
import type {
  CanvasObject,
  CanvasObjectByType,
  CanvasObjectType,
} from "../model/objects";

export const EDITABLE_TEXT_NODE_NAME = "editable-text";

export type ObjectRendererProps<TObject extends CanvasObject> = {
  object: TObject;
  editing: boolean;
};

export type CanvasObjectPresentation<TObject extends CanvasObject> = {
  Renderer: ComponentType<ObjectRendererProps<TObject>>;
  textEditor?: {
    getStyle: (object: TObject) => CSSProperties;
  };
};

export type CanvasObjectPresentationRegistry = {
  [TType in CanvasObjectType]: CanvasObjectPresentation<
    CanvasObjectByType[TType]
  >;
};
