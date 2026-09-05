import type { BbmodelFile } from "./shared/bbmodel";
import { type FSWatcher, watch } from "chokidar";
import { readdir } from "node:fs/promises";
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from "node:http";
import { homedir } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";
import { text } from "node:stream/consumers";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

type JsonPayload = { readonly status: number; readonly value: unknown };

type FileEntry = {
  readonly kind: "directory" | "file";
  readonly name: string;
  readonly path: string;
};

type OpenModelResponse = {
  readonly absolutePath: string;
  readonly fileName: string;
  readonly loadedAt: string;
  readonly model: BbmodelFile;
};

type WatchEvent = OpenModelResponse & { readonly type: "model-updated" };

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(Bun.env["PORT"] ?? "5173");
const clients = new Set<ServerResponse>();

let activePath: string | undefined = undefined;
let watcher: FSWatcher | undefined = undefined;

const vite = await createViteServer({
  appType: "spa",
  root: rootDir,
  server: { middlewareMode: true },
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const host = request.headers.host ?? `localhost:${String(port)}`;
  const url = new URL(request.url ?? "/", `http://${host}`);

  if (url.pathname === "/events") {
    openEventStream(request, response);
    return;
  }

  if (url.pathname === "/api/fs/list") {
    await handleListRequest(url, response);
    return;
  }

  if (url.pathname === "/api/fs/open" && request.method === "POST") {
    await handleOpenRequest(request, response);
    return;
  }

  vite.middlewares(request, response, () => {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });
}

function openEventStream(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  response.writeHead(200, {
    "cache-control": "no-cache",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
  });
  response.write("event: ready\ndata: {}\n\n");
  clients.add(response);
  request.on("close", () => {
    clients.delete(response);
  });
}

async function handleListRequest(
  url: URL,
  response: ServerResponse,
): Promise<void> {
  const directoryPath = resolve(url.searchParams.get("path") ?? homedir());
  const entries = await listDirectory(directoryPath);
  sendJson(response, {
    status: 200,
    value: { entries, path: directoryPath, parentPath: dirname(directoryPath) },
  });
}

async function handleOpenRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = JSON.parse(await text(request)) as { path?: string };
    if (body.path === undefined) {
      throw new Error("ファイルパスがありません。");
    }
    const modelPath = resolve(body.path);
    const result = await readModel(modelPath);
    await watchModel(modelPath);
    sendJson(response, { status: 200, value: result });
  } catch (error: unknown) {
    sendJson(response, {
      status: 400,
      value: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function listDirectory(directoryPath: string): Promise<Array<FileEntry>> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  return entries
    .map((entry) => {
      const path = resolve(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return { kind: "directory" as const, name: entry.name, path };
      }
      if (entry.isFile() && extname(entry.name) === ".bbmodel") {
        return { kind: "file" as const, name: entry.name, path };
      }
      return undefined;
    })
    .filter((entry) => entry !== undefined)
    .toSorted((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

async function watchModel(modelPath: string): Promise<void> {
  if (activePath === modelPath && watcher !== undefined) {
    return;
  }
  activePath = modelPath;
  await watcher?.close();
  watcher = watch(modelPath, {
    awaitWriteFinish: { pollInterval: 80, stabilityThreshold: 180 },
    ignoreInitial: true,
  });
  watcher.on("change", () => {
    // oxlint-disable-next-line promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- chokidar の同期 callback から非同期再読込を起動するため。
    reloadModel(modelPath).catch((error: unknown) => {
      broadcastError(modelPath, error);
    });
  });
}

async function reloadModel(modelPath: string): Promise<void> {
  const result = await readModel(modelPath);
  broadcast({ ...result, type: "model-updated" });
}

async function readModel(modelPath: string): Promise<OpenModelResponse> {
  if (extname(modelPath) !== ".bbmodel") {
    throw new Error(".bbmodel ファイルを選んでください。");
  }
  const stat = await Bun.file(modelPath).stat();
  if (!stat.isFile()) {
    throw new Error("ファイルを開けません。");
  }
  const model = JSON.parse(await Bun.file(modelPath).text()) as BbmodelFile;
  return {
    absolutePath: modelPath,
    fileName: basename(modelPath),
    loadedAt: new Date().toISOString(),
    model,
  };
}

function broadcast(event: WatchEvent): void {
  const message = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(message);
  }
}

function broadcastError(modelPath: string, error: unknown): void {
  const message = `event: model-error\ndata: ${JSON.stringify({
    absolutePath: modelPath,
    error: error instanceof Error ? error.message : String(error),
    fileName: basename(modelPath),
    loadedAt: new Date().toISOString(),
    type: "model-error",
  })}\n\n`;
  for (const client of clients) {
    client.write(message);
  }
}

function sendJson(response: ServerResponse, payload: JsonPayload): void {
  response.writeHead(payload.status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload.value));
}

const server = createServer((request, response) => {
  // oxlint-disable-next-line promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- Node の HTTP callback から非同期処理を起動するため。
  handleRequest(request, response).catch((error: unknown) => {
    sendJson(response, {
      status: 500,
      value: { error: error instanceof Error ? error.message : String(error) },
    });
  });
});

server.listen(port, () => {
  console.log(`bbmodel preview: http://localhost:${String(port)}`);
});
