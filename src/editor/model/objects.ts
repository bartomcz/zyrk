export type ObjectId = string;

export type TextAlignment = "left" | "center" | "right";

export type ObjectFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type TextContent = {
  text: string;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  textAlign: TextAlignment;
};

type CanvasObjectBase<TType extends string> = ObjectFrame & {
  id: ObjectId;
  type: TType;
};

export type TextObject = CanvasObjectBase<"text"> & TextContent;

// Add each serializable object variant here. Shared data belongs in small
// composable types such as ObjectFrame and TextContent rather than a base
// object with many optional properties.
export type CanvasObject = TextObject;

export type CanvasObjectType = CanvasObject["type"];

export type CanvasObjectByType = {
  [TType in CanvasObjectType]: Extract<CanvasObject, { type: TType }>;
};

export function createObjectId(): ObjectId {
  return crypto.randomUUID();
}
