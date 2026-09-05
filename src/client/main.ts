// oxlint-disable eslint/max-lines, import/no-relative-parent-imports, suin/canonical-import-specifier -- UI と描画を同じプロトタイプファイルに置くため。
import type {
  BbmodelElement,
  BbmodelFace,
  BbmodelFile,
  BbmodelTexture,
} from "../shared/bbmodel";
import * as THREE from "three";
// oxlint-disable-next-line import/no-unassigned-import -- Vite が CSS を読み込むために必要です。
import "./style.css";

type LoadedModel = {
  readonly fileName: string;
  readonly absolutePath: string;
  readonly loadedAt: string;
  readonly model: BbmodelFile;
};

type ViewSpec = {
  readonly name: string;
  readonly subtitle: string;
  readonly direction: THREE.Vector3;
};

type PreviewBackgroundMode = "dark" | "light";

type BrowserFileHandle = {
  readonly name: string;
  readonly getFile: () => Promise<File>;
};

type BrowserOpenFilePicker = (options: {
  readonly excludeAcceptAllOption?: boolean;
  readonly multiple?: false;
  readonly types?: ReadonlyArray<{
    readonly accept: Record<string, ReadonlyArray<string>>;
    readonly description: string;
  }>;
}) => Promise<Array<BrowserFileHandle>>;

type FileBrowserEntry = {
  readonly kind: "directory" | "file";
  readonly name: string;
  readonly path: string;
};

type FileBrowserListing = {
  readonly entries: Array<FileBrowserEntry>;
  readonly parentPath: string;
  readonly path: string;
};

type ServerModelResponse = LoadedModel | { readonly error: string };

type ServerWatchEvent = LoadedModel & { readonly type: "model-updated" };

type ServerErrorEvent = {
  readonly error: string;
  readonly type: "model-error";
};

const previewBackgroundColors: Readonly<Record<PreviewBackgroundMode, string>> =
  { dark: "#101114", light: "#f7f7f2" };

const app = document.querySelector("#app");
if (app === null) {
  throw new Error("#app がありません。");
}

const views: ReadonlyArray<ViewSpec> = [
  {
    name: "Front",
    subtitle: "north face",
    direction: new THREE.Vector3(0, 0, -1),
  },
  {
    name: "Back",
    subtitle: "south face",
    direction: new THREE.Vector3(0, 0, 1),
  },
  {
    name: "Left",
    subtitle: "west side",
    direction: new THREE.Vector3(-1, 0, 0),
  },
  {
    name: "Right",
    subtitle: "east side",
    direction: new THREE.Vector3(1, 0, 0),
  },
  { name: "Top", subtitle: "above", direction: new THREE.Vector3(0, 1, 0) },
  { name: "Bottom", subtitle: "below", direction: new THREE.Vector3(0, -1, 0) },
  {
    name: "Front Right",
    subtitle: "45 degree",
    direction: new THREE.Vector3(1, 0, -1),
  },
  {
    name: "Front Left",
    subtitle: "45 degree",
    direction: new THREE.Vector3(-1, 0, -1),
  },
  {
    name: "Back Right",
    subtitle: "45 degree",
    direction: new THREE.Vector3(1, 0, 1),
  },
  {
    name: "Back Left",
    subtitle: "45 degree",
    direction: new THREE.Vector3(-1, 0, 1),
  },
  {
    name: "Top Front",
    subtitle: "45 degree above",
    direction: new THREE.Vector3(0, 1, -1),
  },
  {
    name: "Top Right",
    subtitle: "45 degree above",
    direction: new THREE.Vector3(1, 1, 0),
  },
  {
    name: "Studio",
    subtitle: "3/4 creative view",
    direction: new THREE.Vector3(1, 0.72, 1),
  },
];

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"></span>
        <div>
          <h1>bbmodel preview</h1>
          <p>BlockBench の保存を見ながら、形と色を同時に確かめる作業台。</p>
        </div>
      </div>
      <div class="header-file">
        <span id="reload-state" class="state idle">waiting</span>
        <div class="header-file-main">
          <strong id="model-name">No file opened</strong>
          <span id="model-meta">Choose a .bbmodel file.</span>
        </div>
        <span id="source-meta">Open the file browser to choose a .bbmodel.</span>
      </div>
      <div class="actions">
        <div class="preview-background-toggle" aria-label="Preview background">
          <button
            id="preview-background-dark"
            class="background-button selected"
            type="button"
            aria-pressed="true"
          >
            Black
          </button>
          <button
            id="preview-background-light"
            class="background-button"
            type="button"
            aria-pressed="false"
          >
            White
          </button>
        </div>
        <button id="open-browser-button" class="open-button" type="button">Open .bbmodel</button>
        <input id="file-input" class="fallback-input" type="file" accept=".bbmodel" />
      </div>
    </header>

    <section class="workspace">
      <section class="view-grid" id="view-grid"></section>
    </section>

    <dialog id="file-dialog" class="file-dialog">
      <div class="dialog-head">
        <div class="traffic-lights" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <strong class="finder-title">Open .bbmodel</strong>
        <button id="close-dialog-button" class="dialog-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="finder-shell">
        <nav class="finder-sidebar" aria-label="Locations">
          <span class="finder-sidebar-title">Locations</span>
          <button id="home-location-button" type="button">Home</button>
          <button id="root-location-button" type="button">Root</button>
          <button id="system-picker-button" type="button">System picker</button>
        </nav>
        <div class="file-browser">
          <div class="browser-toolbar">
            <button id="parent-button" type="button" title="Parent folder">↑</button>
            <button id="refresh-button" type="button" title="Refresh">↻</button>
            <div class="path-row">
              <input id="path-input" class="path-input" type="text" spellcheck="false" />
              <button id="go-button" class="icon-button" type="button" title="Open path">Go</button>
            </div>
          </div>
          <div class="finder-list-head" aria-hidden="true">
            <span>Name</span>
            <span>Kind</span>
          </div>
          <div id="file-list" class="file-list" aria-label="Local files"></div>
        </div>
      </div>
    </dialog>
  </main>
`;

const openBrowserButton = mustQuery(
  "#open-browser-button",
) as HTMLButtonElement;
const previewBackgroundDarkButton = mustQuery(
  "#preview-background-dark",
) as HTMLButtonElement;
const previewBackgroundLightButton = mustQuery(
  "#preview-background-light",
) as HTMLButtonElement;
const closeDialogButton = mustQuery(
  "#close-dialog-button",
) as HTMLButtonElement;
const systemPickerButton = mustQuery(
  "#system-picker-button",
) as HTMLButtonElement;
const homeLocationButton = mustQuery(
  "#home-location-button",
) as HTMLButtonElement;
const rootLocationButton = mustQuery(
  "#root-location-button",
) as HTMLButtonElement;
const fileDialog = mustQuery("#file-dialog") as HTMLDialogElement;
const fileInput = mustQuery("#file-input") as HTMLInputElement;
const pathInput = mustQuery("#path-input") as HTMLInputElement;
const goButton = mustQuery("#go-button") as HTMLButtonElement;
const parentButton = mustQuery("#parent-button") as HTMLButtonElement;
const refreshButton = mustQuery("#refresh-button") as HTMLButtonElement;
const fileListElement = mustQuery("#file-list") as HTMLElement;
const sourceMetaElement = mustQuery("#source-meta") as HTMLElement;
const modelNameElement = mustQuery("#model-name") as HTMLElement;
const modelMetaElement = mustQuery("#model-meta") as HTMLElement;
const reloadStateElement = mustQuery("#reload-state") as HTMLElement;
const viewGrid = mustQuery("#view-grid") as HTMLElement;

let renderers: Array<RendererView> = [];
let animationFrame = 0;
let browserFileLastModified = 0;
let browserWatchTimer: ReturnType<typeof globalThis.setInterval> | undefined =
  undefined;
let isBrowserReloading = false;
let currentDirectory = "";
let homeDirectory = "";
let previewBackgroundMode: PreviewBackgroundMode = "dark";

for (const view of views) {
  const card = document.createElement("article");
  card.className =
    view.name === "Studio" ? "viewport-card studio-card" : "viewport-card";
  card.innerHTML = `
    <div class="viewport-head">
      <strong>${view.name}</strong>
      <span>${view.subtitle}</span>
    </div>
    <div class="canvas-wrap"></div>
  `;
  viewGrid.append(card);
}

openBrowserButton.addEventListener("click", () => {
  if (!fileDialog.open) {
    fileDialog.showModal();
  }
  pathInput.focus();
});

previewBackgroundDarkButton.addEventListener("click", () => {
  setPreviewBackground("dark");
});

previewBackgroundLightButton.addEventListener("click", () => {
  setPreviewBackground("light");
});

closeDialogButton.addEventListener("click", () => {
  fileDialog.close();
});

systemPickerButton.addEventListener("click", () => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- DOM event handler から非同期 file picker を起動するため。
  openBrowserFile().catch(reportClientError);
});

homeLocationButton.addEventListener("click", () => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- DOM event handler から非同期ディレクトリ移動を起動するため。
  loadDirectory(homeDirectory).catch(reportClientError);
});

rootLocationButton.addEventListener("click", () => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- DOM event handler から非同期ディレクトリ移動を起動するため。
  loadDirectory("/").catch(reportClientError);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file === undefined) {
    return;
  }
  // oxlint-disable-next-line promise/prefer-await-to-then -- DOM event handler から非同期処理を起動するため。
  openUploadedFile(file).catch(reportClientError);
});

goButton.addEventListener("click", () => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- DOM event handler から非同期ディレクトリ移動を起動するため。
  loadDirectory(pathInput.value).catch(reportClientError);
});

pathInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    // oxlint-disable-next-line promise/prefer-await-to-then -- キー操作から非同期ディレクトリ移動を起動するため。
    loadDirectory(pathInput.value).catch(reportClientError);
  }
});

parentButton.addEventListener("click", () => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- DOM event handler から非同期ディレクトリ移動を起動するため。
  loadDirectory(parentButton.dataset["path"] ?? currentDirectory).catch(
    reportClientError,
  );
});

refreshButton.addEventListener("click", () => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- DOM event handler から非同期更新を起動するため。
  loadDirectory(currentDirectory).catch(reportClientError);
});

const events = new EventSource("/events");
events.addEventListener("model-updated", (event) => {
  const update = JSON.parse(
    (event as MessageEvent<string>).data,
  ) as ServerWatchEvent;
  setStatus("reloaded", "hot");
  sourceMetaElement.textContent = update.absolutePath;
  // oxlint-disable-next-line promise/prefer-await-to-then -- EventSource callback から非同期描画を起動するため。
  loadIntoScene(update).catch(reportClientError);
});
events.addEventListener("model-error", (event) => {
  const update = JSON.parse(
    (event as MessageEvent<string>).data,
  ) as ServerErrorEvent;
  setStatus(update.error, "error");
});

await loadDirectory();
startAnimation();

async function loadDirectory(path?: string): Promise<void> {
  setFileListBusy("loading");
  const url = new URL("/api/fs/list", globalThis.location.href);
  if (path !== undefined && path.length > 0) {
    url.searchParams.set("path", path);
  }
  const response = await fetch(url);
  const listing = (await response.json()) as
    | FileBrowserListing
    | { readonly error: string };
  if (!response.ok || "error" in listing) {
    throw new Error("error" in listing ? listing.error : "folder open failed");
  }
  currentDirectory = listing.path;
  if (homeDirectory.length === 0) {
    homeDirectory = listing.path;
  }
  pathInput.value = listing.path;
  parentButton.dataset["path"] = listing.parentPath;
  renderFileList(listing.entries);
}

function renderFileList(entries: Array<FileBrowserEntry>): void {
  if (entries.length === 0) {
    fileListElement.replaceChildren(emptyFileList());
    return;
  }
  fileListElement.replaceChildren(
    ...entries.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `file-entry ${entry.kind}`;
      button.innerHTML = `<span class="file-icon" aria-hidden="true"></span><strong></strong><span class="file-kind">${
        entry.kind === "directory" ? "Folder" : "BlockBench model"
      }</span>`;
      const nameElement = button.querySelector("strong");
      if (nameElement !== null) {
        nameElement.textContent = entry.name;
      }
      button.addEventListener("click", () => {
        if (entry.kind === "directory") {
          // oxlint-disable-next-line promise/prefer-await-to-then -- ファイル一覧クリックから非同期移動を起動するため。
          loadDirectory(entry.path).catch(reportClientError);
        } else {
          // oxlint-disable-next-line promise/prefer-await-to-then -- ファイル一覧クリックから非同期読込を起動するため。
          openServerModel(entry.path).catch(reportClientError);
        }
      });
      return button;
    }),
  );
}

function emptyFileList(): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "empty-list";
  empty.textContent = "No folders or .bbmodel files here.";
  return empty;
}

function setFileListBusy(text: string): void {
  const busy = document.createElement("div");
  busy.className = "empty-list";
  busy.textContent = text;
  fileListElement.replaceChildren(busy);
}

async function openServerModel(path: string): Promise<void> {
  stopBrowserWatch();
  setStatus("opening", "busy");
  sourceMetaElement.textContent = path;
  const response = await fetch("/api/fs/open", {
    body: JSON.stringify({ path }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as ServerModelResponse;
  if (!response.ok || "error" in body) {
    throw new Error("error" in body ? body.error : "open failed");
  }
  setStatus("watching", "hot");
  await loadIntoScene(body);
  fileDialog.close();
}

async function openBrowserFile(): Promise<void> {
  const picker = getBrowserOpenFilePicker();
  if (picker === undefined) {
    fileInput.click();
    return;
  }

  const [handle] = await picker({
    excludeAcceptAllOption: false,
    multiple: false,
    types: [
      {
        accept: { "application/json": [".bbmodel"] },
        description: "BlockBench model",
      },
    ],
  });
  if (handle === undefined) {
    return;
  }

  stopBrowserWatch();
  await loadBrowserHandle(handle, "watching");
  browserWatchTimer = globalThis.setInterval(() => {
    // oxlint-disable-next-line promise/prefer-await-to-then -- interval から非同期更新確認を起動するため。
    reloadBrowserHandleIfChanged(handle).catch(reportClientError);
  }, 900);
}

async function openUploadedFile(file: File): Promise<void> {
  stopBrowserWatch();
  await loadBrowserFile(file, "opened");
}

async function reloadBrowserHandleIfChanged(
  handle: BrowserFileHandle,
): Promise<void> {
  if (isBrowserReloading) {
    return;
  }
  isBrowserReloading = true;
  try {
    const file = await handle.getFile();
    if (file.lastModified > browserFileLastModified) {
      await loadBrowserFile(file, "reloaded");
    }
  } finally {
    isBrowserReloading = false;
  }
}

async function loadBrowserHandle(
  handle: BrowserFileHandle,
  status: "reloaded" | "watching",
): Promise<void> {
  await loadBrowserFile(await handle.getFile(), status);
}

async function loadBrowserFile(
  file: File,
  status: "opened" | "reloaded" | "watching",
): Promise<void> {
  if (!file.name.endsWith(".bbmodel")) {
    throw new Error(".bbmodel ファイルを選んでください。");
  }
  const model = JSON.parse(await file.text()) as BbmodelFile;
  browserFileLastModified = file.lastModified;
  sourceMetaElement.textContent =
    status === "opened"
      ? "Loaded from browser file input. Automatic reload needs File System Access API."
      : "Watching this file for changes in the browser.";
  setStatus(status, status === "opened" ? "busy" : "hot");
  await loadIntoScene({
    absolutePath: "browser-selected file",
    fileName: file.name,
    loadedAt: new Date(
      file.lastModified === 0 ? Date.now() : file.lastModified,
    ).toISOString(),
    model,
  });
  fileDialog.close();
}

async function loadIntoScene(model: LoadedModel): Promise<void> {
  modelNameElement.textContent = model.fileName;
  const elements =
    model.model.elements?.filter((element) => element.type === "cube").length ??
    0;
  const textures = model.model.textures?.length ?? 0;
  modelMetaElement.textContent = `${String(elements)} cubes / ${String(textures)} textures / ${new Date(
    model.loadedAt,
  ).toLocaleTimeString()}`;
  await renderModel(model.model);
}

async function renderModel(model: BbmodelFile): Promise<void> {
  for (const renderer of renderers) {
    renderer.dispose();
  }
  renderers = [];

  const textureMap = await buildTextures(model.textures ?? []);
  const cards = [...document.querySelectorAll<HTMLElement>(".viewport-card")];
  for (const [index, card] of cards.entries()) {
    const wrap = card.querySelector<HTMLElement>(".canvas-wrap");
    const view = views[index];
    if (wrap !== null && view !== undefined) {
      const rendererView = createRendererView({
        container: wrap,
        model,
        textureMap,
        view,
      });
      renderers.push(rendererView);
    }
  }
}

function createRendererView(options: {
  readonly container: HTMLElement;
  readonly model: BbmodelFile;
  readonly textureMap: ReadonlyMap<string, THREE.Texture>;
  readonly view: ViewSpec;
}): RendererView {
  const { container, model, textureMap, view } = options;
  container.replaceChildren();

  const scene = new THREE.Scene();
  scene.background = makeSceneBackground(previewBackgroundMode);
  scene.add(new THREE.HemisphereLight("#f4efe3", "#3d5a66", 2.4));

  const keyLight = new THREE.DirectionalLight("#fff2d4", 1.8);
  keyLight.position.set(8, 10, 6);
  scene.add(keyLight);

  const modelGroup = buildModelGroup({ model, textureMap });
  scene.add(modelGroup);

  const bounds = new THREE.Box3().setFromObject(modelGroup);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 8);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);

  const grid = new THREE.GridHelper(radius * 1.8, 12, "#2c9f8f", "#2d3138");
  grid.position.y = bounds.min.y;
  scene.add(grid);

  const resize = () => {
    const rect = container.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    const aspect = rect.width / Math.max(rect.height, 1);
    const frame = radius * 0.72;
    camera.left = -frame * aspect;
    camera.right = frame * aspect;
    camera.top = frame;
    camera.bottom = -frame;
    camera.updateProjectionMatrix();
  };
  resize();

  const direction = view.direction.clone().normalize();
  camera.position.copy(
    center.clone().add(direction.multiplyScalar(radius * 2.4)),
  );
  camera.up.set(0, 1, 0);
  if (Math.abs(view.direction.y) > 0.9) {
    camera.up.set(0, 0, -1);
  }
  camera.lookAt(center);

  return {
    dispose: () => {
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      container.replaceChildren();
    },
    render: () => {
      resize();
      if (view.name === "Studio") {
        modelGroup.rotation.y += 0.0035;
      }
      renderer.render(scene, camera);
    },
    setBackground: (mode) => {
      scene.background = makeSceneBackground(mode);
      renderer.render(scene, camera);
    },
  };
}

function buildModelGroup(options: {
  readonly model: BbmodelFile;
  readonly textureMap: ReadonlyMap<string, THREE.Texture>;
}): THREE.Group {
  const { model, textureMap } = options;
  const group = new THREE.Group();
  const elements =
    model.elements?.filter((element) => element.type === "cube") ?? [];

  for (const element of elements) {
    const { from, to } = element;
    if (from !== undefined && to !== undefined) {
      const cube = buildCube({
        element,
        textures: textureMap,
        uvHeight: model.resolution?.height ?? 64,
        uvWidth: model.resolution?.width ?? 64,
      });
      group.add(cube);
    }
  }

  return group;
}

async function buildTextures(
  textures: ReadonlyArray<BbmodelTexture>,
): Promise<Map<string, THREE.Texture>> {
  const loader = new THREE.TextureLoader();
  const map = new Map<string, THREE.Texture>();
  const loadedTextures = await Promise.all(
    textures.map(async (texture, index) => {
      const { source } = texture;
      if (source === undefined || source.length === 0) {
        return undefined;
      }
      return { index, loaded: await loader.loadAsync(source), texture };
    }),
  );
  for (const item of loadedTextures) {
    if (item !== undefined) {
      item.loaded.colorSpace = THREE.SRGBColorSpace;
      item.loaded.magFilter = THREE.NearestFilter;
      item.loaded.minFilter = THREE.NearestFilter;
      item.loaded.wrapS = THREE.RepeatWrapping;
      item.loaded.wrapT = THREE.RepeatWrapping;
      map.set(String(item.texture.id ?? item.index), item.loaded);
      map.set(String(item.index), item.loaded);
    }
  }
  return map;
}

function buildCube(options: {
  readonly element: BbmodelElement;
  readonly textures: ReadonlyMap<string, THREE.Texture>;
  readonly uvHeight: number;
  readonly uvWidth: number;
}): THREE.Object3D {
  const { element, textures, uvHeight, uvWidth } = options;
  const elementFrom = element.from ?? [0, 0, 0];
  const elementTo = element.to ?? [0, 0, 0];
  const from = new THREE.Vector3(...elementFrom);
  const to = new THREE.Vector3(...elementTo);
  const size = to.clone().sub(from);
  const center = from.clone().add(to).multiplyScalar(0.5);
  const origin = new THREE.Vector3(...(element.origin ?? [0, 0, 0]));
  const geometry = new THREE.BoxGeometry(
    Math.abs(size.x),
    Math.abs(size.y),
    Math.abs(size.z),
  );
  const materials = [
    materialForFace({
      face: element.faces?.east,
      fallbackColor: "#5bc0be",
      textures,
      uvHeight,
      uvWidth,
    }),
    materialForFace({
      face: element.faces?.west,
      fallbackColor: "#f7b267",
      textures,
      uvHeight,
      uvWidth,
    }),
    materialForFace({
      face: element.faces?.up,
      fallbackColor: "#f4f1de",
      textures,
      uvHeight,
      uvWidth,
    }),
    materialForFace({
      face: element.faces?.down,
      fallbackColor: "#293241",
      textures,
      uvHeight,
      uvWidth,
    }),
    materialForFace({
      face: element.faces?.south,
      fallbackColor: "#e56b6f",
      textures,
      uvHeight,
      uvWidth,
    }),
    materialForFace({
      face: element.faces?.north,
      fallbackColor: "#84dcc6",
      textures,
      uvHeight,
      uvWidth,
    }),
  ];
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.copy(center.sub(origin));

  const pivot = new THREE.Group();
  pivot.position.copy(origin);
  const rotation = element.rotation ?? [0, 0, 0];
  pivot.rotation.set(
    degToRad(rotation[0]),
    degToRad(rotation[1]),
    degToRad(rotation[2]),
  );
  pivot.add(mesh);
  return pivot;
}

function materialForFace(options: {
  readonly face: BbmodelFace | undefined;
  readonly fallbackColor: THREE.ColorRepresentation;
  readonly textures: ReadonlyMap<string, THREE.Texture>;
  readonly uvHeight: number;
  readonly uvWidth: number;
}): THREE.Material {
  const { face, fallbackColor, textures, uvHeight, uvWidth } = options;
  const textureId =
    face?.texture === undefined ? undefined : String(face.texture);
  const sourceTexture =
    textureId === undefined ? undefined : textures.get(textureId);
  if (sourceTexture === undefined || face?.uv === undefined) {
    return new THREE.MeshStandardMaterial({
      color: fallbackColor,
      metalness: 0.08,
      roughness: 0.68,
      side: THREE.DoubleSide,
    });
  }

  const [u1, v1, u2, v2] = face.uv;
  const texture = sourceTexture.clone();
  texture.repeat.set((u2 - u1) / uvWidth, -(v2 - v1) / uvHeight);
  texture.offset.set(u1 / uvWidth, 1 - v1 / uvHeight);
  return new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.02,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
}

function startAnimation(): void {
  const tick = () => {
    for (const renderer of renderers) {
      renderer.render();
    }
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

function reportClientError(error: unknown): void {
  if (error instanceof DOMException && error.name === "AbortError") {
    return;
  }
  setStatus(error instanceof Error ? error.message : String(error), "error");
}

function setStatus(text: string, kind: "busy" | "error" | "hot"): void {
  reloadStateElement.textContent = text;
  reloadStateElement.className = `state ${kind}`;
}

function setPreviewBackground(mode: PreviewBackgroundMode): void {
  previewBackgroundMode = mode;
  previewBackgroundDarkButton.classList.toggle("selected", mode === "dark");
  previewBackgroundLightButton.classList.toggle("selected", mode === "light");
  previewBackgroundDarkButton.setAttribute(
    "aria-pressed",
    String(mode === "dark"),
  );
  previewBackgroundLightButton.setAttribute(
    "aria-pressed",
    String(mode === "light"),
  );
  for (const renderer of renderers) {
    renderer.setBackground(mode);
  }
}

function makeSceneBackground(mode: PreviewBackgroundMode): THREE.Color {
  return new THREE.Color(previewBackgroundColors[mode]);
}

function stopBrowserWatch(): void {
  if (browserWatchTimer !== undefined) {
    globalThis.clearInterval(browserWatchTimer);
    browserWatchTimer = undefined;
  }
  browserFileLastModified = 0;
  isBrowserReloading = false;
}

function getBrowserOpenFilePicker(): BrowserOpenFilePicker | undefined {
  const browserGlobal = globalThis as typeof globalThis & {
    readonly showOpenFilePicker?: BrowserOpenFilePicker;
  };
  return browserGlobal.showOpenFilePicker;
}

function mustQuery(selector: string): Element {
  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`${selector} がありません。`);
  }
  return element;
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const mesh = object as THREE.Mesh;
      mesh.geometry.dispose();
      disposeMaterial(mesh.material);
    }
  });
}

function disposeMaterial(
  materialOrMaterials: THREE.Material | Array<THREE.Material>,
): void {
  const materials = Array.isArray(materialOrMaterials)
    ? materialOrMaterials
    : [materialOrMaterials];
  for (const material of materials) {
    if (material instanceof THREE.MeshStandardMaterial) {
      material.map?.dispose();
    }
    material.dispose();
  }
}

type RendererView = {
  readonly dispose: () => void;
  readonly render: () => void;
  readonly setBackground: (mode: PreviewBackgroundMode) => void;
};

window.addEventListener("beforeunload", () => {
  stopBrowserWatch();
  cancelAnimationFrame(animationFrame);
  for (const renderer of renderers) {
    renderer.dispose();
  }
});
