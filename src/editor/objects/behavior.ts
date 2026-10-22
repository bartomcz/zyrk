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
};

export type TextMeasurement = {
  text: string;
  width: number;
  fontSize: number;
  fontFamily: string;
};

export type TextHeightMeasurer = (measurement: TextMeasurement) => number;

export type TextEditorBehavior<TObject extends CanvasObject> = {
  getValue: (object: TObject) => string;
  update: (
    object: TObject,
    value: string,
    contentWidth: number,
    contentHeight: number,
  ) => TObject;
  finish: (object: TObject) => TObject | null;
};

export type CanvasObjectBehavior<TObject extends CanvasObject> = {
  create: (context: CreateObjectContext) => TObject;
  transform: {
    minWidth: number;
    minHeight: number;
    keepRatio: boolean;
    textResize?: "reflow-horizontal" | "preserve-font-size";
    reflowHeight?: (
      object: TObject,
      width: number,
      measureTextHeight: TextHeightMeasurer,
    ) => number;
    withFrame: (
      object: TObject,
      frame: ObjectFrame,
      resizeMode?: "scale" | "reflow",
    ) => TObject;
  };
  textEditor?: TextEditorBehavior<TObject>;
};

export type CanvasObjectBehaviorRegistry = {
  [TType in CanvasObjectType]: CanvasObjectBehavior<
    CanvasObjectByType[TType]
  >;
};
