import type {
  CanvasObject,
  CanvasObjectByType,
  CanvasObjectType,
} from "../model/objects";
import type {
  CanvasObjectDefinition,
  CanvasObjectDefinitionRegistry,
  CreateObjectContext,
} from "./definition";
import { rectangleObjectDefinition } from "./rectangle/RectangleObject";
import { textObjectDefinition } from "./text/TextObject";

export const objectDefinitions = {
  text: textObjectDefinition,
  rectangle: rectangleObjectDefinition,
} satisfies CanvasObjectDefinitionRegistry;

export function getObjectDefinition<TObject extends CanvasObject>(
  object: TObject,
): CanvasObjectDefinition<TObject> {
  // The registry is exhaustive by object type. TypeScript cannot retain the
  // correlation between a generic object's discriminator and the mapped value.
  return objectDefinitions[object.type] as unknown as CanvasObjectDefinition<
    TObject
  >;
}

export function createCanvasObject<TType extends CanvasObjectType>(
  type: TType,
  context: CreateObjectContext,
): CanvasObjectByType[TType] {
  const definition = objectDefinitions[type] as unknown as CanvasObjectDefinition<
    CanvasObjectByType[TType]
  >;
  return definition.create(context);
}

export function resizeCanvasObject<TObject extends CanvasObject>(
  object: TObject,
  size: { width?: number; height?: number },
): TObject {
  const definition = getObjectDefinition(object);
  const angle = (object.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const center = {
    x: object.x + (object.width / 2) * cos - (object.height / 2) * sin,
    y: object.y + (object.width / 2) * sin + (object.height / 2) * cos,
  };
  const width = size.width ?? object.width;
  const height = definition.transform.reflowHeight
    ? definition.transform.reflowHeight(object, width)
    : (size.height ?? object.height);
  const resized = definition.transform.withFrame(
    object,
    {
      x: center.x - (width / 2) * cos + (height / 2) * sin,
      y: center.y - (width / 2) * sin - (height / 2) * cos,
      width,
      height,
      rotation: object.rotation,
    },
    definition.transform.reflowHeight ? "reflow" : "scale",
  );

  return (resized.type === "text" && size.width !== undefined
    ? { ...resized, autoWidth: false }
    : resized) as TObject;
}
