import type { CanvasObject } from "../model/objects";
import type {
  CanvasObjectPresentation,
  CanvasObjectPresentationRegistry,
} from "./definition";
import { rectangleObjectPresentation } from "./rectangle/RectangleObject";
import { textObjectPresentation } from "./text/TextObject";

export const objectPresentations = {
  text: textObjectPresentation,
  rectangle: rectangleObjectPresentation,
} satisfies CanvasObjectPresentationRegistry;

export function getObjectPresentation<TObject extends CanvasObject>(
  object: TObject,
): CanvasObjectPresentation<TObject> {
  return objectPresentations[
    object.type
  ] as unknown as CanvasObjectPresentation<TObject>;
}
