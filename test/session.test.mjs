import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let vite;
let createDocumentSession;
let createCanvasDocument;

before(async () => {
  vite = await createServer({ appType: "custom", logLevel: "silent" });
  ({ createDocumentSession } = await vite.ssrLoadModule(
    "/src/editor/state/documentSession.ts",
  ));
  ({ createCanvasDocument } = await vite.ssrLoadModule(
    "/src/editor/model/document.ts",
  ));
});
after(async () => { await vite?.close(); });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function recoverySnapshot(document, overrides = {}) {
  return {
    formatVersion: 1,
    savedAt: "2025-01-01T00:00:00.000Z",
    document,
    documentPath: "/recovered.json",
    lastExplicitlySavedRevision: null,
    ...overrides,
  };
}

function fixture({ cached = null, loaded = cached } = {}) {
  const hydration = deferred();
  const saves = [];
  const opens = [];
  const recoveries = [];
  let loads = 0;
  const session = createDocumentSession({
    documents: {
      open: () => {
        const operation = deferred();
        opens.push(operation);
        return operation.promise;
      },
      save: (document, path) => {
        const operation = deferred();
        saves.push({ ...operation, document, path });
        return operation.promise;
      },
    },
    recovery: {
      loadCached: () => cached,
      load: () => { loads += 1; return hydration.promise; },
      save: async (snapshot) => { recoveries.push(snapshot); return true; },
    },
  });
  return {
    session, hydration, saves, opens, recoveries,
    get loads() { return loads; },
    async ready() {
      const pending = session.hydrate();
      hydration.resolve(loaded);
      await pending;
      return session;
    },
  };
}

const rename = (session, title) =>
  session.applyCommand({ type: "document/rename", title });
const getCanvas = (session) => session.automationService.execute({
  apiVersion: 1, operation: "canvas.get",
});
const addRectangle = (session) => session.automationService.execute({
  apiVersion: 1, operation: "canvas.object.add", objectType: "rectangle",
  center: { x: 100, y: 200 },
});

// No React renderer or subscriber: acknowledgements must reflect committed state.
test("acknowledged automation mutations support immediate dependent reads and writes", async () => {
  const session = await fixture().ready();
  const first = addRectangle(session);
  assert.equal(first.ok, true);
  assert.deepEqual(getCanvas(session).document.objects[first.object.id], first.object);
  const resized = session.automationService.execute({
    apiVersion: 1, operation: "canvas.object.resize", objectId: first.object.id,
    size: { width: 300 },
  });
  assert.equal(resized.ok, true);
  const second = addRectangle(session);
  const connected = session.automationService.execute({
    apiVersion: 1, operation: "canvas.connection.add",
    from: { objectId: first.object.id, edge: "right" },
    to: { objectId: second.object.id, edge: "left" },
  });
  assert.equal(connected.ok, true);
  const canvas = getCanvas(session).document;
  assert.equal(canvas.revision, 4);
  assert.deepEqual(canvas.objects[first.object.id], resized.object);
  assert.deepEqual(canvas.connections, [connected.connection]);
});

test("hydration rejects requests rather than acknowledging edits that recovery overwrites", async () => {
  const cached = recoverySnapshot(createCanvasDocument([], "Cached"));
  const loaded = recoverySnapshot(createCanvasDocument([], "Native"), {
    savedAt: "2025-01-02T00:00:00.000Z",
  });
  const f = fixture({ cached, loaded });
  assert.equal(f.session.getSnapshot().document.title, "Cached");
  assert.equal(f.session.getSnapshot().recoveryHydrated, false);
  for (const response of [addRectangle(f.session), getCanvas(f.session)]) {
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "internal_error");
    assert.match(response.error.message, /recovery|ready/i);
  }
  assert.throws(() => rename(f.session, "Too early"), /ready/i);
  assert.throws(() => f.session.newDocument(), /ready/i);
  await assert.rejects(f.session.openDocument(), /ready/i);
  await assert.rejects(f.session.saveDocument(), /ready/i);
  assert.equal(f.recoveries.length, 0);
  await f.ready();
  assert.equal(getCanvas(f.session).document.title, "Native");
  assert.equal(f.session.getSnapshot().documentPath, loaded.documentPath);
  assert.equal(f.session.getSnapshot().isDirty, true);
  assert.equal(addRectangle(f.session).ok, true);
  assert.equal(getCanvas(f.session).document.order.length, 1);
});

test("hydration is idempotent across repeated effect setup", async () => {
  const f = fixture();
  const first = f.session.hydrate();
  const second = f.session.hydrate();
  await f.ready();
  await Promise.all([first, second]);
  rename(f.session, "Keep this edit");
  await f.session.hydrate();
  assert.equal(f.loads, 1);
  assert.equal(f.session.getSnapshot().document.title, "Keep this edit");
});

test("recovery load failure retains the cached session and permits saving to its path", async (t) => {
  const cached = recoverySnapshot(createCanvasDocument([], "Cached"), {
    lastExplicitlySavedRevision: 0,
  });
  const f = fixture({ cached });
  const errors = t.mock.method(console, "error", () => {});
  const loading = f.session.hydrate();
  f.hydration.reject(new Error("recovery unavailable"));
  await loading;
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(f.session.getSnapshot().recoveryHydrated, true);
  assert.equal(f.session.getSnapshot().document.title, "Cached");
  assert.equal(f.session.getSnapshot().isDirty, false);
  rename(f.session, "Edited");
  const saving = f.session.saveDocument();
  await Promise.resolve();
  assert.equal(f.saves[0].path, cached.documentPath);
  f.saves[0].resolve({ saved: true, path: cached.documentPath });
  await saving;
  assert.equal(f.session.getSnapshot().isDirty, false);
});

for (const replacement of ["new", "open", "reopen"]) {
  test(`a pending save cannot update metadata after ${replacement}`, async () => {
    const f = fixture();
    const session = await f.ready();
    rename(session, "Original");
    const original = session.getSnapshot().document;
    const saving = session.saveDocument(true);
    await Promise.resolve();
    assert.equal(f.saves.length, 1);
    if (replacement === "new") {
      session.newDocument();
    } else {
      const opening = session.openDocument();
      f.opens[0].resolve({
        document: replacement === "reopen" ? original : createCanvasDocument(),
        path: "/replacement.json",
      });
      assert.equal(await opening, true);
    }
    const replaced = session.getSnapshot();
    f.saves[0].resolve({ saved: true, path: "/old-save.json" });
    await saving;
    assert.strictEqual(session.getSnapshot(), replaced);
    assert.equal(session.getSnapshot().isDirty, false);
  });
}

test("editing during a save remains dirty and recovery includes the saved snapshot revision", async () => {
  const f = fixture();
  const session = await f.ready();
  rename(session, "Saved content");
  const savedDocument = session.getSnapshot().document;
  const saving = session.saveDocument();
  await Promise.resolve();
  rename(session, "Later edit");
  assert.strictEqual(f.saves[0].document, savedDocument);
  f.saves[0].resolve({ saved: true, path: "/saved.json" });
  await saving;
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.documentPath, "/saved.json");
  assert.equal(snapshot.lastExplicitlySavedRevision, savedDocument.revision);
  assert.equal(snapshot.isDirty, true);
  assert.equal(f.recoveries.at(-1).document.title, "Later edit");
  assert.equal(f.recoveries.at(-1).lastExplicitlySavedRevision, savedDocument.revision);
});

test("saves are serialized so older writes cannot finish after newer writes to the same path", async () => {
  const f = fixture();
  const session = await f.ready();
  rename(session, "First");
  const first = session.saveDocument(true);
  rename(session, "Second");
  const second = session.saveDocument();
  rename(session, "Not requested for save");
  await Promise.resolve();
  assert.equal(f.saves.length, 1);
  assert.equal(f.saves[0].document.title, "First");
  f.saves[0].resolve({ saved: true, path: "/same.json" });
  await first;
  await Promise.resolve();
  assert.equal(f.saves.length, 2);
  assert.equal(f.saves[1].path, "/same.json");
  assert.equal(f.saves[1].document.title, "Second");
  f.saves[1].resolve({ saved: true, path: "/same.json" });
  await second;
  assert.equal(session.getSnapshot().lastExplicitlySavedRevision, 2);
  assert.equal(session.getSnapshot().isDirty, true);
});

test("replacement drops queued old saves but allows saves from the new session", async () => {
  const f = fixture();
  const session = await f.ready();
  rename(session, "Old");
  const first = session.saveDocument();
  const obsolete = session.saveDocument(true);
  await Promise.resolve();
  session.newDocument();
  rename(session, "New");
  const current = session.saveDocument();
  f.saves[0].resolve({ saved: true, path: "/old.json" });
  await Promise.all([first, obsolete]);
  await Promise.resolve();
  assert.equal(f.saves.length, 2);
  assert.equal(f.saves[1].document.title, "New");
  assert.equal(f.saves[1].path, null);
  f.saves[1].resolve({ saved: true, path: "/new.json" });
  await current;
  assert.equal(session.getSnapshot().documentPath, "/new.json");
  assert.equal(session.getSnapshot().isDirty, false);
});

test("cancelled and failed saves preserve metadata and do not block later saves", async () => {
  const f = fixture();
  const session = await f.ready();
  rename(session, "Unsaved");
  const before = session.getSnapshot();
  const cancelled = session.saveDocument();
  await Promise.resolve();
  f.saves[0].resolve({ saved: false, path: null });
  await cancelled;
  assert.strictEqual(session.getSnapshot(), before);
  const failed = session.saveDocument();
  const rejection = assert.rejects(failed, /disk full/);
  await Promise.resolve();
  f.saves[1].reject(new Error("disk full"));
  await rejection;
  assert.strictEqual(session.getSnapshot(), before);
  const succeeded = session.saveDocument();
  await Promise.resolve();
  f.saves[2].resolve({ saved: true, path: "/success.json" });
  await succeeded;
  assert.equal(session.getSnapshot().isDirty, false);
  const saveAs = session.saveDocument(true);
  await Promise.resolve();
  assert.equal(f.saves[3].path, null);
  f.saves[3].resolve({ saved: true, path: "/save-as.json" });
  await saveAs;
  assert.equal(session.getSnapshot().documentPath, "/save-as.json");
});

test("only the latest Open request may replace a session, even for identical document IDs", async () => {
  const f = fixture();
  const session = await f.ready();
  const document = session.getSnapshot().document;
  const first = session.openDocument();
  const second = session.openDocument();
  f.opens[1].resolve({ document, path: "/second.json" });
  assert.equal(await second, true);
  rename(session, "Keep latest edit");
  f.opens[0].resolve({ document, path: "/first.json" });
  assert.equal(await first, false);
  assert.equal(session.getSnapshot().document.title, "Keep latest edit");
  assert.equal(session.getSnapshot().documentPath, "/second.json");
  const stale = session.openDocument();
  session.newDocument();
  const blank = session.getSnapshot();
  f.opens[2].resolve({ document, path: "/stale.json" });
  assert.equal(await stale, false);
  assert.strictEqual(session.getSnapshot(), blank);
});

test("an older Open cannot replace the session while a newer request is pending or cancelled", async () => {
  const f = fixture();
  const session = await f.ready();
  const before = session.getSnapshot();
  const older = session.openDocument();
  const newer = session.openDocument();
  f.opens[0].resolve({ document: createCanvasDocument(), path: "/older.json" });
  assert.equal(await older, false);
  assert.strictEqual(session.getSnapshot(), before);
  f.opens[1].resolve(null);
  assert.equal(await newer, false);
  assert.strictEqual(session.getSnapshot(), before);
});

test("cancelled and failed Opens leave the current document intact", async () => {
  const f = fixture();
  const session = await f.ready();
  const before = session.getSnapshot();
  const cancelled = session.openDocument();
  f.opens[0].resolve(null);
  assert.equal(await cancelled, false);
  const failed = session.openDocument();
  f.opens[1].reject(new Error("invalid document"));
  await assert.rejects(failed, /invalid document/);
  assert.strictEqual(session.getSnapshot(), before);
});

test("subscriptions, grouped history, undo/redo and recovery use the same committed state", async () => {
  const f = fixture();
  const session = await f.ready();
  const snapshots = [];
  const unsubscribe = session.subscribe(() => snapshots.push(session.getSnapshot()));
  const initial = session.getSnapshot();
  assert.strictEqual(session.getSnapshot(), initial);
  rename(session, initial.document.title);
  assert.equal(snapshots.length, 0);
  session.applyCommand({ type: "document/rename", title: "One" }, "edit");
  session.applyCommand({ type: "document/rename", title: "Two" }, "edit");
  session.endCommandGroup("edit");
  assert.equal(session.getSnapshot().canUndo, true);
  session.undo();
  assert.equal(getCanvas(session).document.title, initial.document.title);
  assert.equal(session.getSnapshot().canRedo, true);
  session.redo();
  assert.equal(getCanvas(session).document.title, "Two");
  session.applyCommand({ type: "document/rename", title: "Cancel me" }, "cancel");
  session.cancelCommandGroup("cancel");
  assert.equal(getCanvas(session).document.title, "Two");
  assert.strictEqual(snapshots.at(-1), session.getSnapshot());
  assert.strictEqual(f.recoveries.at(-1).document, session.getSnapshot().document);
  const latest = f.recoveries.at(-1);
  session.flushRecovery();
  assert.strictEqual(f.recoveries.at(-1), latest);
  unsubscribe();
  const count = snapshots.length;
  session.newDocument();
  assert.equal(snapshots.length, count);
  assert.equal(session.getSnapshot().canUndo, false);
  assert.equal(session.getSnapshot().canRedo, false);
});
