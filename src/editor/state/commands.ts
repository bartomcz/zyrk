import type { CanvasDocument } from "../model/document";
import type {
  CanvasConnection,
  CanvasObject,
  ObjectId,
} from "../model/objects";

export type DocumentCommand =
  | { type: "object/add"; object: CanvasObject; index?: number }
  | { type: "object/update"; object: CanvasObject }
  | { type: "object/remove"; ids: ObjectId[] }
  | { type: "object/reorder"; order: ObjectId[] }
  | { type: "connection/add"; connection: CanvasConnection }
  | { type: "connection/update"; connection: CanvasConnection }
  | { type: "connection/remove"; id: string }
  | { type: "document/rename"; title: string };

function commitDocument(
  document: CanvasDocument,
  changes: Partial<CanvasDocument>,
  occurredAt: string,
): CanvasDocument {
  return {
    ...document,
    ...changes,
    revision: document.revision + 1,
    updatedAt: occurredAt,
  };
}

export function applyDocumentCommand(
  document: CanvasDocument,
  command: DocumentCommand,
  occurredAt: string,
): CanvasDocument {
  switch (command.type) {
    case "object/add": {
      if (document.objects[command.object.id]) return document;

      const index = Math.min(
        Math.max(command.index ?? document.order.length, 0),
        document.order.length,
      );
      const order = [...document.order];
      order.splice(index, 0, command.object.id);

      return commitDocument(
        document,
        {
          objects: {
            ...document.objects,
            [command.object.id]: command.object,
          },
          order,
        },
        occurredAt,
      );
    }

    case "object/update": {
      const current = document.objects[command.object.id];
      if (!current || current === command.object) return document;

      return commitDocument(
        document,
        {
          objects: {
            ...document.objects,
            [command.object.id]: command.object,
          },
        },
        occurredAt,
      );
    }

    case "object/remove": {
      const removedIds = new Set(
        command.ids.filter((id) => document.objects[id]),
      );
      if (removedIds.size === 0) return document;

      const objects = { ...document.objects };
      for (const id of removedIds) delete objects[id];

      return commitDocument(
        document,
        {
          objects,
          order: document.order.filter((id) => !removedIds.has(id)),
          connections: document.connections.filter(
            ({ from, to }) =>
              !removedIds.has(from.objectId) && !removedIds.has(to.objectId),
          ),
        },
        occurredAt,
      );
    }

    case "object/reorder": {
      const currentIds = new Set(document.order);
      const nextIds = new Set(command.order);
      const isValid =
        command.order.length === document.order.length &&
        nextIds.size === currentIds.size &&
        command.order.every((id) => currentIds.has(id));
      const isUnchanged = command.order.every(
        (id, index) => id === document.order[index],
      );
      if (!isValid || isUnchanged) return document;

      return commitDocument(
        document,
        { order: [...command.order] },
        occurredAt,
      );
    }

    case "connection/add": {
      const { connection } = command;
      if (
        document.connections.some(({ id }) => id === connection.id) ||
        connection.from.objectId === connection.to.objectId ||
        !document.objects[connection.from.objectId] ||
        !document.objects[connection.to.objectId]
      ) {
        return document;
      }

      return commitDocument(
        document,
        { connections: [...document.connections, connection] },
        occurredAt,
      );
    }

    case "connection/update": {
      const { connection } = command;
      const index = document.connections.findIndex(
        ({ id }) => id === connection.id,
      );
      if (
        index === -1 ||
        connection.from.objectId === connection.to.objectId ||
        !document.objects[connection.from.objectId] ||
        !document.objects[connection.to.objectId]
      ) {
        return document;
      }

      const current = document.connections[index];
      if (
        current.from.objectId === connection.from.objectId &&
        current.from.edge === connection.from.edge &&
        current.to.objectId === connection.to.objectId &&
        current.to.edge === connection.to.edge
      ) {
        return document;
      }

      const connections = [...document.connections];
      connections[index] = connection;
      return commitDocument(document, { connections }, occurredAt);
    }

    case "connection/remove": {
      const connections = document.connections.filter(
        ({ id }) => id !== command.id,
      );
      if (connections.length === document.connections.length) return document;
      return commitDocument(document, { connections }, occurredAt);
    }

    case "document/rename": {
      const title = command.title.trim() || "Untitled";
      if (title === document.title) return document;
      return commitDocument(document, { title }, occurredAt);
    }
  }
}
