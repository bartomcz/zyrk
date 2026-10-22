import type {
  CanvasObject,
  CanvasObjectByType,
  CanvasObjectType,
} from "../model/objects";
import type {
  CanvasObjectBehavior,
  CanvasObjectBehaviorRegistry,
  CreateObjectContext,
  TextHeightMeasurer,
} from "./behavior";
import { frameFromCenter, getFrameCenter } from "./geometry";
import { rectangleObjectBehavior } from "./rectangle/behavior";
import { textObjectBehavior } from "./text/behavior";

export const objectBehaviors = {
  text: textObjectBehavior,
  rectangle: rectangleObjectBehavior,
} satisfies CanvasObjectBehaviorRegistry;

export function getObjectBehavior<TObject extends CanvasObject>(
  object: TObject,
): CanvasObjectBehavior<TObject> {
  // TypeScript cannot retain the discriminator-to-registry correlation here.
  return objectBehaviors[
    object.type
  ] as unknown as CanvasObjectBehavior<TObject>;
}

export function createCanvasObject<TType extends CanvasObjectType>(
  type: TType,
  context: CreateObjectContext,
): CanvasObjectByType[TType] {
  const behavior = objectBehaviors[type] as unknown as CanvasObjectBehavior<
    CanvasObjectByType[TType]
  >;
  return behavior.create(context);
}

export function resizeCanvasObject<TObject extends CanvasObject>(
  object: TObject,
  size: { width?: number; height?: number },
  measureTextHeight: TextHeightMeasurer,
): TObject {
  const behavior = getObjectBehavior(object);
  const center = getFrameCenter(object);
  const width = size.width ?? object.width;
  const height = behavior.transform.reflowHeight
    ? behavior.transform.reflowHeight(object, width, measureTextHeight)
    : (size.height ?? object.height);
  const resized = behavior.transform.withFrame(
    object,
    frameFromCenter(center, { width, height }, object.rotation),
    behavior.transform.reflowHeight ? "reflow" : "scale",
  );

  return (resized.type === "text" && size.width !== undefined
    ? { ...resized, autoWidth: false }
    : resized) as TObject;
}
