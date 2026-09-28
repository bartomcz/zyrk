import {
  DOCUMENT_SCHEMA_VERSION,
  type CanvasDocument,
} from "./document";
import type {
  CanvasObject,
  ObjectFrame,
  RectangleObject,
  TextAlignment,
  TextContent,
  TextObject,
} from "./objects";

export class InvalidDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDocumentError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidDocumentError(`${path} must be an object`);
  }
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new InvalidDocumentError(`${path} must be a string`);
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidDocumentError(`${path} must be a finite number`);
  }
  return value;
}

function positiveNumber(value: unknown, path: string): number {
  const parsed = finiteNumber(value, path);
  if (parsed <= 0) {
    throw new InvalidDocumentError(`${path} must be greater than zero`);
  }
  return parsed;
}

function nonNegativeNumber(value: unknown, path: string): number {
  const parsed = finiteNumber(value, path);
  if (parsed < 0) {
    throw new InvalidDocumentError(`${path} must be non-negative`);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, path: string): number {
  const parsed = nonNegativeNumber(value, path);
  if (!Number.isInteger(parsed)) {
    throw new InvalidDocumentError(`${path} must be a non-negative integer`);
  }
  return parsed;
}

function parseFrame(value: Record<string, unknown>, path: string): ObjectFrame {
  return {
    x: finiteNumber(value.x, `${path}.x`),
    y: finiteNumber(value.y, `${path}.y`),
    width: positiveNumber(value.width, `${path}.width`),
    height: positiveNumber(value.height, `${path}.height`),
    rotation: finiteNumber(value.rotation, `${path}.rotation`),
  };
}

function parseTextAlignment(value: unknown, path: string): TextAlignment {
  if (value === "left" || value === "center" || value === "right") {
    return value;
  }
  throw new InvalidDocumentError(`${path} has an unsupported alignment`);
}

function parseTextContent(
  value: Record<string, unknown>,
  path: string,
): TextContent {
  return {
    text: string(value.text, `${path}.text`),
    fontSize: positiveNumber(value.fontSize, `${path}.fontSize`),
    fontFamily: string(value.fontFamily, `${path}.fontFamily`),
    textColor: string(value.textColor, `${path}.textColor`),
    textAlign: parseTextAlignment(value.textAlign, `${path}.textAlign`),
  };
}

function parseTextObject(
  value: Record<string, unknown>,
  path: string,
): TextObject {
  return {
    id: string(value.id, `${path}.id`),
    type: "text",
    ...parseFrame(value, path),
    ...parseTextContent(value, path),
  };
}

function parseRectangleObject(
  value: Record<string, unknown>,
  path: string,
): RectangleObject {
  return {
    id: string(value.id, `${path}.id`),
    type: "rectangle",
    ...parseFrame(value, path),
    color: string(value.color, `${path}.color`),
    strokeWidth: nonNegativeNumber(value.strokeWidth, `${path}.strokeWidth`),
    ...parseTextContent(value, path),
  };
}

function parseCanvasObject(value: unknown, path: string): CanvasObject {
  const candidate = record(value, path);
  const type = string(candidate.type, `${path}.type`);

  switch (type) {
    case "text":
      return parseTextObject(candidate, path);
    case "rectangle":
      return parseRectangleObject(candidate, path);
    default:
      throw new InvalidDocumentError(
        `${path}.type contains unsupported object type "${type}"`,
      );
  }
}

function migrateDocumentValue(value: unknown): unknown {
  const candidate = record(value, "document");
  const version = nonNegativeInteger(
    candidate.schemaVersion,
    "document.schemaVersion",
  );

  if (version === DOCUMENT_SCHEMA_VERSION) return candidate;

  throw new InvalidDocumentError(
    `Document schema version ${version} is not supported`,
  );
}

export function parseCanvasDocumentValue(value: unknown): CanvasDocument {
  const candidate = record(migrateDocumentValue(value), "document");
  const objectValues = record(candidate.objects, "document.objects");
  const objects: Record<string, CanvasObject> = {};

  for (const [key, objectValue] of Object.entries(objectValues)) {
    const object = parseCanvasObject(objectValue, `document.objects.${key}`);
    if (object.id !== key) {
      throw new InvalidDocumentError(
        `document.objects.${key}.id must match its object key`,
      );
    }
    objects[key] = object;
  }

  if (!Array.isArray(candidate.order)) {
    throw new InvalidDocumentError("document.order must be an array");
  }
  const order = candidate.order.map((id, index) =>
    string(id, `document.order.${index}`),
  );
  const orderedIds = new Set(order);
  if (orderedIds.size !== order.length) {
    throw new InvalidDocumentError("document.order contains duplicate ids");
  }
  if (
    order.length !== Object.keys(objects).length ||
    order.some((id) => !objects[id])
  ) {
    throw new InvalidDocumentError(
      "document.order must contain every object id exactly once",
    );
  }

  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: string(candidate.id, "document.id"),
    title: string(candidate.title, "document.title"),
    revision: nonNegativeInteger(candidate.revision, "document.revision"),
    createdAt: string(candidate.createdAt, "document.createdAt"),
    updatedAt: string(candidate.updatedAt, "document.updatedAt"),
    objects,
    order,
  };
}

export function parseCanvasDocument(json: string): CanvasDocument {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new InvalidDocumentError("The selected file is not valid JSON");
  }
  return parseCanvasDocumentValue(value);
}

export function serializeCanvasDocument(document: CanvasDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
