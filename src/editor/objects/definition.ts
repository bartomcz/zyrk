import type { ComponentType, CSSProperties } from "react";
import type {
  CanvasObject,
  CanvasObjectByType,
  CanvasObjectType,
  ObjectFrame,
  ObjectId,
} from "../model/objects";

export const EDITABLE_TEXT_NODE_NAME = "editable-text";

export type CreateObjectContext = {
  id: ObjectId;
  center: { x: number; y: number };
};

export type ObjectRendererProps<TObject extends CanvasObject> = {
  object: TObject;
  editing: boolean;
};

export type TextEditorBehavior<TObject extends CanvasObject> = {
  getValue: (object: TObject) => string;
  update: (
    object: TObject,
    value: string,
    contentHeight: number,
  ) => TObject;
  finish: (object: TObject) => TObject | null;
  getStyle: (object: TObject) => CSSProperties;
};

export type CanvasObjectDefinition<TObject extends CanvasObject> = {
  create: (context: CreateObjectContext) => TObject;
  Renderer: ComponentType<ObjectRendererProps<TObject>>;
  transform: {
    minWidth: number;
    minHeight: number;
    keepRatio: boolean;
    textResize?: "reflow-horizontal" | "preserve-font-size";
    withFrame: (object: TObject, frame: ObjectFrame) => TObject;
  };
  textEditor?: TextEditorBehavior<TObject>;
};

export type CanvasObjectDefinitionRegistry = {
  [TType in CanvasObjectType]: CanvasObjectDefinition<
    CanvasObjectByType[TType]
  >;
};
