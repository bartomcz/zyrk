import type { ComponentType, CSSProperties } from "react";
import type {
  CanvasObject,
  CanvasObjectByType,
  CanvasObjectType,
  ObjectFrame,
  ObjectId,
} from "../model/objects";

export type CreateObjectContext = {
  id: ObjectId;
  center: { x: number; y: number };
  offset: number;
};

export type ObjectRendererProps<TObject extends CanvasObject> = {
  object: TObject;
  editing: boolean;
};

export type TextEditorBehavior<TObject extends CanvasObject> = {
  multiline: boolean;
  emptyValue: string;
  getValue: (object: TObject) => string;
  withValue: (object: TObject, value: string) => TObject;
  getStyle: (object: TObject) => CSSProperties;
};

export type CanvasObjectDefinition<TObject extends CanvasObject> = {
  create: (context: CreateObjectContext) => TObject;
  Renderer: ComponentType<ObjectRendererProps<TObject>>;
  transform: {
    minWidth: number;
    minHeight: number;
    canResize: boolean;
    canRotate: boolean;
    withFrame: (object: TObject, frame: ObjectFrame) => TObject;
  };
  textEditor?: TextEditorBehavior<TObject>;
};

export type CanvasObjectDefinitionRegistry = {
  [TType in CanvasObjectType]: CanvasObjectDefinition<
    CanvasObjectByType[TType]
  >;
};
