import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const binaryName = process.platform === "win32" ? "zyrk.exe" : "zyrk";
const appBinary = path.resolve("src-tauri", "target", "debug", binaryName);
const cliBinary = path.resolve("src-cli", "target", "debug", binaryName);
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

test(
  "all CLI commands update the active canvas",
  { timeout: 45_000 },
  async (t) => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "zyrk-e2e-"),
    );
    const environment = {
      ...process.env,
      TMPDIR: temporaryDirectory,
      TMP: temporaryDirectory,
      TEMP: temporaryDirectory,
      XDG_CONFIG_HOME: path.join(temporaryDirectory, "config"),
      XDG_DATA_HOME: path.join(temporaryDirectory, "data"),
    };
    const app = spawn(appBinary, [], {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let appOutput = "";
    app.stdout.on("data", (chunk) => (appOutput += chunk));
    app.stderr.on("data", (chunk) => (appOutput += chunk));

    t.after(async () => {
      if (app.exitCode === null && app.signalCode === null) {
        app.kill();
        await Promise.race([
          new Promise((resolve) => app.once("exit", resolve)),
          pause(5_000),
        ]);
        if (app.exitCode === null && app.signalCode === null) {
          app.kill("SIGKILL");
        }
      }
      await rm(temporaryDirectory, { recursive: true, force: true });
    });

    const runCli = async (...args) => {
      const { stdout } = await execute(cliBinary, args, {
        env: environment,
        timeout: 5_000,
      });
      return JSON.parse(stdout);
    };

    const waitForCanvas = async () => {
      const deadline = Date.now() + 30_000;
      let lastError;
      while (Date.now() < deadline) {
        if (app.exitCode !== null || app.signalCode !== null) {
          throw new Error(`Zyrk exited before becoming ready:\n${appOutput}`);
        }
        try {
          return await runCli("canvas", "get");
        } catch (error) {
          lastError = error;
        }
        await pause(250);
      }
      throw new Error(
        `Timed out waiting for Zyrk: ${lastError?.message ?? "canvas was not updated"}\n${appOutput}`,
      );
    };

    let before;
    let text;
    let rectangle;

    await t.test("canvas get", async () => {
      before = await waitForCanvas();
      assert.equal(before.ok, true);
      assert.equal(before.operation, "canvas.get");
    });

    await t.test("canvas object add text", async () => {
      text = await runCli(
        "canvas",
        "object",
        "add",
        "text",
        "--x",
        "100",
        "--y",
        "200",
        "--text",
        "E2E text",
        "--width",
        "180",
      );
      const canvas = await runCli("canvas", "get");

      assert.equal(text.ok, true);
      assert.equal(text.object.type, "text");
      assert.equal(text.object.text, "E2E text");
      assert.equal(text.object.width, 180);
      assert.deepEqual(canvas.document.objects[text.object.id], text.object);
      assert.equal(canvas.document.revision, before.document.revision + 1);
    });

    await t.test("canvas object add rectangle", async () => {
      rectangle = await runCli(
        "canvas",
        "object",
        "add",
        "rectangle",
        "--x",
        "400",
        "--y",
        "200",
        "--width",
        "240",
        "--height",
        "120",
        "--text",
        "E2E rectangle",
      );
      const canvas = await runCli("canvas", "get");

      assert.equal(rectangle.ok, true);
      assert.equal(rectangle.object.type, "rectangle");
      assert.equal(rectangle.object.text, "E2E rectangle");
      assert.equal(rectangle.object.width, 240);
      assert.equal(rectangle.object.height, 120);
      assert.deepEqual(
        canvas.document.objects[rectangle.object.id],
        rectangle.object,
      );
      assert.equal(canvas.document.revision, before.document.revision + 2);
    });

    await t.test("canvas object resize", async () => {
      const resized = await runCli(
        "canvas",
        "object",
        "resize",
        rectangle.object.id,
        "--width",
        "300",
        "--height",
        "160",
      );
      const canvas = await runCli("canvas", "get");

      assert.equal(resized.ok, true);
      assert.equal(resized.object.width, 300);
      assert.equal(resized.object.height, 160);
      assert.equal(resized.object.x + resized.object.width / 2, 400);
      assert.equal(resized.object.y + resized.object.height / 2, 200);
      assert.deepEqual(
        canvas.document.objects[rectangle.object.id],
        resized.object,
      );
      assert.equal(canvas.document.revision, before.document.revision + 3);
    });

    await t.test("canvas connection add", async () => {
      const added = await runCli(
        "canvas",
        "connection",
        "add",
        "--from",
        text.object.id,
        "--from-edge",
        "right",
        "--to",
        rectangle.object.id,
        "--to-edge",
        "left",
      );
      const canvas = await runCli("canvas", "get");

      assert.equal(added.ok, true);
      assert.deepEqual(added.connection.from, {
        objectId: text.object.id,
        edge: "right",
      });
      assert.deepEqual(added.connection.to, {
        objectId: rectangle.object.id,
        edge: "left",
      });
      assert.deepEqual(
        canvas.document.connections.find(
          (connection) => connection.id === added.connection.id,
        ),
        added.connection,
      );
      assert.equal(
        canvas.document.connections.length,
        before.document.connections.length + 1,
      );
      assert.equal(canvas.document.revision, before.document.revision + 4);
    });
  },
);
