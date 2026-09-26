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
import { textObjectDefinition } from "./text/TextObject";

export const objectDefinitions = {
  text: textObjectDefinition,
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
  const definition = objectDefinitions[type] as CanvasObjectDefinition<
    CanvasObjectByType[TType]
  >;
  return definition.create(context);
}
