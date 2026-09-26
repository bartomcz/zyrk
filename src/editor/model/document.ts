import { createObjectId, type CanvasObject, type ObjectId } from "./objects";

export const DOCUMENT_SCHEMA_VERSION = 1 as const;

export type CanvasDocument = {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  objects: Record<ObjectId, CanvasObject>;
  order: ObjectId[];
};

export function createCanvasDocument(
  initialObjects: CanvasObject[] = [],
  title = "Untitled",
): CanvasDocument {
  const now = new Date().toISOString();

  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: createObjectId(),
    title,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    objects: Object.fromEntries(
      initialObjects.map((object) => [object.id, object]),
    ),
    order: initialObjects.map((object) => object.id),
  };
}

export function restoreDocumentContent(
  snapshot: CanvasDocument,
  revision: number,
  updatedAt: string,
): CanvasDocument {
  return {
    ...snapshot,
    revision,
    updatedAt,
  };
}
