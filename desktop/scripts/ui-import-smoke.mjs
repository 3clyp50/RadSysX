import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(__filename), "..");
const workspaceRoot = path.resolve(desktopRoot, "..");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "radsysx-desktop-ui-import-smoke-"));
const fixtureRoot = path.join(tmpRoot, "fixtures");
const storageRoot = path.join(tmpRoot, "local-imaging-data");
const dbPath = path.join(tmpRoot, "clinical.db");
const maxStartupMs = Number.parseInt(process.env.RADSYSX_UI_IMPORT_SMOKE_STARTUP_MS ?? "120000", 10);
const smokeMode = process.argv.includes("--picker-folder") ? "picker-folder" : "drag-drop";

let desktopProcess = null;
let desktopPublicBaseUrl = null;

async function main() {
  try {
    fs.mkdirSync(fixtureRoot, { recursive: true });
    fs.mkdirSync(storageRoot, { recursive: true });

    generateFixtures(fixtureRoot);
    const runtime = await startDesktopRuntime();
    const result = await runUiImportSmoke(runtime.publicBaseUrl, runtime.debugPort);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  } finally {
    await stopDesktopRuntime();
    if (process.env.RADSYSX_KEEP_UI_IMPORT_SMOKE_TMP === "1") {
      console.log(`Kept UI smoke workspace at ${tmpRoot}`);
    } else {
      fs.rmSync(tmpRoot, { force: true, recursive: true });
    }
  }
}

function electronCommand() {
  return path.join(
    workspaceRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron.cmd" : "electron",
  );
}

function pythonCommand() {
  const venvPython = path.join(workspaceRoot, ".venv", "bin", "python");
  return fs.existsSync(venvPython) ? venvPython : "python3";
}

function asFileUrlPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

async function findAvailablePort(preferredPort, usedPorts = new Set()) {
  for (let candidate = preferredPort; candidate < preferredPort + 100; candidate += 1) {
    if (usedPorts.has(candidate)) {
      continue;
    }
    if (await canListen(candidate)) {
      usedPorts.add(candidate);
      return candidate;
    }
  }

  throw new Error(`Unable to find an available local port near ${preferredPort}.`);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function generateFixtures(outputDir) {
  const python = spawnSync(
    pythonCommand(),
    [
      "-c",
      `
import gzip
import struct
import sys
from pathlib import Path

import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, MediaStorageDirectoryStorage, generate_uid

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)

study_uid = "1.2.826.0.1.3680043.10.54321.910"
series_uid = "1.2.826.0.1.3680043.10.54321.911"
sop_uid = "1.2.826.0.1.3680043.10.54321.912"

file_meta = FileMetaDataset()
file_meta.MediaStorageSOPClassUID = CTImageStorage
file_meta.MediaStorageSOPInstanceUID = sop_uid
file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

dataset = FileDataset(None, {}, file_meta=file_meta, preamble=b"\\0" * 128)
dataset.SOPClassUID = CTImageStorage
dataset.SOPInstanceUID = sop_uid
dataset.StudyInstanceUID = study_uid
dataset.SeriesInstanceUID = series_uid
dataset.Modality = "CT"
dataset.PatientID = "SMOKE-DO-NOT-LOG"
dataset.Rows = 2
dataset.Columns = 2
dataset.SamplesPerPixel = 1
dataset.PhotometricInterpretation = "MONOCHROME2"
dataset.BitsAllocated = 8
dataset.BitsStored = 8
dataset.HighBit = 7
dataset.PixelRepresentation = 0
dataset.PixelData = bytes([0, 1, 2, 3])
dataset.is_little_endian = True
dataset.is_implicit_VR = False
dataset.save_as(root / "SCAN1DCM", enforce_file_format=True)

directory_meta = FileMetaDataset()
directory_meta.MediaStorageSOPClassUID = MediaStorageDirectoryStorage
directory_meta.MediaStorageSOPInstanceUID = generate_uid()
directory_meta.TransferSyntaxUID = ExplicitVRLittleEndian

dicomdir = FileDataset(None, {}, file_meta=directory_meta, preamble=b"\\0" * 128)
dicomdir.SOPClassUID = MediaStorageDirectoryStorage
dicomdir.SOPInstanceUID = directory_meta.MediaStorageSOPInstanceUID
dicomdir.is_little_endian = True
dicomdir.is_implicit_VR = False
record = Dataset()
record.DirectoryRecordType = "IMAGE"
record.ReferencedFileID = ["SCAN1DCM"]
dicomdir.DirectoryRecordSequence = Sequence([record])
dicomdir.save_as(root / "DICOMDIR", enforce_file_format=True)

header = bytearray(352)
header[0:4] = (348).to_bytes(4, "little")
header[40:56] = struct.pack("<8h", 3, 2, 3, 4, 1, 1, 1, 1)
header[70:72] = (2).to_bytes(2, "little", signed=True)
header[72:74] = (8).to_bytes(2, "little", signed=True)
header[108:112] = struct.pack("<f", 352.0)
header[344:348] = b"n+1\\0"
voxels = bytes(range(24))
(root / "volume.nii").write_bytes(bytes(header) + voxels)
(root / "volume.nii.gz").write_bytes(gzip.compress(bytes(header) + voxels))
(root / "slice.png").write_bytes(
    b"\\x89PNG\\r\\n\\x1a\\n"
    b"\\x00\\x00\\x00\\rIHDR"
    b"\\x00\\x00\\x00\\x01\\x00\\x00\\x00\\x01\\x08\\x02\\x00\\x00\\x00"
    b"\\x90wS\\xde"
    b"\\x00\\x00\\x00\\x0cIDATx\\x9cc\\xf8\\xff\\xff?\\x00\\x05\\xfe\\x02\\xfe"
    b"\\xdc\\xccY\\xe7"
    b"\\x00\\x00\\x00\\x00IEND\\xaeB\\x60\\x82"
)
`,
      outputDir,
    ],
    {
      cwd: workspaceRoot,
      encoding: "utf-8",
    },
  );

  if (python.status !== 0) {
    throw new Error(
      [
        "Unable to generate local imaging UI smoke fixtures.",
        python.stdout,
        python.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

async function startDesktopRuntime() {
  const usedPorts = new Set();
  const appPort = await findAvailablePort(
    Number.parseInt(process.env.RADSYSX_DESKTOP_PORT ?? "37100", 10),
    usedPorts,
  );
  const frontendPort = await findAvailablePort(
    Number.parseInt(process.env.RADSYSX_DESKTOP_FRONTEND_PORT ?? "37110", 10),
    usedPorts,
  );
  const backendPort = await findAvailablePort(
    Number.parseInt(process.env.RADSYSX_DESKTOP_BACKEND_PORT ?? "37180", 10),
    usedPorts,
  );
  const debugPort = await findAvailablePort(
    Number.parseInt(process.env.RADSYSX_DESKTOP_DEBUG_PORT ?? "37190", 10),
    usedPorts,
  );

  const env = {
    ...process.env,
    RADSYSX_DESKTOP_PORT: String(appPort),
    RADSYSX_DESKTOP_FRONTEND_PORT: String(frontendPort),
    RADSYSX_DESKTOP_BACKEND_PORT: String(backendPort),
    RADSYSX_LOCAL_IMAGING_ENABLED: "true",
    RADSYSX_LOCAL_IMAGING_STORAGE_DIR: storageRoot,
    RADSYSX_CLINICAL_DATABASE_URL: `sqlite:///${asFileUrlPath(dbPath)}`,
    RADSYSX_SESSION_COOKIE_SECURE: "false",
    RADSYSX_DESKTOP_ALLOW_TEST_SHUTDOWN: "1",
    ...(smokeMode === "picker-folder"
      ? { RADSYSX_DESKTOP_PICKER_TEST_PATHS: JSON.stringify([fixtureRoot]) }
      : {}),
  };

  return new Promise((resolve, reject) => {
    desktopProcess = spawn(
      electronCommand(),
      ["--no-sandbox", `--remote-debugging-port=${debugPort}`, desktopRoot],
      {
        cwd: workspaceRoot,
        detached: process.platform !== "win32",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const startedAt = Date.now();
    let settled = false;
    const logs = [];
    const timeout = setInterval(() => {
      if (settled) {
        return;
      }
      if (Date.now() - startedAt > maxStartupMs) {
        settled = true;
        clearInterval(timeout);
        reject(new Error(`Desktop runtime did not become ready.\n${logs.slice(-80).join("\n")}`));
      }
    }, 500);
    timeout.unref();

    const handleOutput = (scope, chunk) => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const entry = `[${scope}] ${line}`;
        logs.push(entry);
        console.log(entry);
        const match = line.match(/RadSysX desktop is ready at (http:\/\/127\.0\.0\.1:\d+)/);
        if (match && !settled) {
          settled = true;
          desktopPublicBaseUrl = match[1];
          clearInterval(timeout);
          resolve({ publicBaseUrl: match[1], debugPort });
        }
      }
    };

    desktopProcess.stdout?.on("data", (chunk) => handleOutput("desktop", chunk));
    desktopProcess.stderr?.on("data", (chunk) => handleOutput("desktop", chunk));
    desktopProcess.once("error", (error) => {
      if (!settled) {
        settled = true;
        clearInterval(timeout);
        reject(error);
      }
    });
    desktopProcess.once("exit", (code, signal) => {
      if (!settled) {
        settled = true;
        clearInterval(timeout);
        reject(new Error(`Desktop runtime exited early with ${signal ?? code ?? "unknown"}.`));
      }
    });
  });
}

async function runUiImportSmoke(publicBaseUrl, debugPort) {
  const target = await waitForDebugTarget(debugPort);
  const cdp = await CdpClient.connect(target.webSocketDebuggerUrl);

  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    cdp.on("Runtime.exceptionThrown", (params) => {
      const details = params.exceptionDetails;
      const location = details?.url
        ? `${details.url}:${(details.lineNumber ?? 0) + 1}:${(details.columnNumber ?? 0) + 1}`
        : "";
      const description = details?.exception?.description ?? details?.text;
      if (description) {
        console.log(`[renderer:exception] ${location} ${description}`.trim());
      }
    });
    await waitForRendererCondition(
      cdp,
      `window.location.origin === ${JSON.stringify(publicBaseUrl)} &&
        window.location.pathname === "/" &&
        document.readyState !== "loading"`,
      "settled desktop root renderer",
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await evaluateInRenderer(
      cdp,
      `fetch("/api/auth/local-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: "demo-radiologist" })
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return response.status;
      })`,
      30000,
    );
    await evaluateInRenderer(
      cdp,
      `(() => {
        const clinicalLink = Array.from(document.querySelectorAll("a"))
          .find((link) => link.getAttribute("href") === "/worklist");
        if (!clinicalLink) {
          throw new Error("Clinical worklist link was not found on the desktop root page.");
        }
        clinicalLink.click();
        return true;
      })()`,
      30000,
    );
    await waitForRendererCondition(
      cdp,
      `window.location.pathname === "/worklist" &&
        Boolean(document.querySelector('[data-testid="local-import-panel"]'))`,
      "hydrated worklist local import panel",
    );

    const result = await evaluateInRenderer(
      cdp,
      `(${uiSmokeInRenderer.toString()})(${JSON.stringify(readFixturePayloads())}, ${JSON.stringify(smokeMode)})`,
      120000,
    );

    return {
      ok: true,
      smokeMode,
      publicBaseUrl,
      ...result,
    };
  } finally {
    cdp.close();
  }
}

function readFixturePayloads() {
  return [
    ["DICOMDIR", "ui-smoke/DICOMDIR", "application/dicom"],
    ["SCAN1DCM", "ui-smoke/SCAN1DCM", "application/dicom"],
    ["volume.nii", "ui-smoke/volume.nii", "application/octet-stream"],
    ["volume.nii.gz", "ui-smoke/volume.nii.gz", "application/gzip"],
    ["slice.png", "ui-smoke/slice.png", "image/png"],
  ].map(([name, relativePath, type]) => ({
    base64: fs.readFileSync(path.join(fixtureRoot, name)).toString("base64"),
    name,
    relativePath,
    type,
  }));
}

async function waitForDebugTarget(debugPort) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < maxStartupMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, {
        cache: "no-store",
      });
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl);
        if (target) {
          return target;
        }
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Unable to find Electron renderer debug target on ${debugPort}.` +
      `${lastError ? ` Last error: ${lastError.message}` : ""}`,
  );
}

async function waitForRendererCondition(cdp, expression, label, timeoutMs = 60000) {
  const startedAt = Date.now();
  let lastState = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastState = await evaluateInRenderer(cdp, `(() => {
        const ok = Boolean(${expression});
        return {
          ok,
          href: window.location.href,
          readyState: document.readyState,
          bodyText: (document.body?.innerText ?? "").slice(0, 1200),
          scripts: Array.from(document.scripts).map((script) => ({
            src: script.src,
            type: script.type,
          })).slice(0, 40),
          testIds: Array.from(document.querySelectorAll("[data-testid]")).map((node) => node.getAttribute("data-testid")),
        };
      })()`);
      if (lastState.ok) {
        return;
      }
    } catch (error) {
      lastState = { error: error instanceof Error ? error.message : String(error) };
      // The renderer can recreate its execution context during navigation.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`${label} did not become ready. Last renderer state: ${JSON.stringify(lastState)}`);
}

async function evaluateInRenderer(cdp, expression, timeoutMs = 30000) {
  const evaluation = await cdp.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    timeoutMs,
  );

  if (evaluation.exceptionDetails) {
    throw new Error(formatCdpException(evaluation.exceptionDetails));
  }

  return evaluation.result.value;
}

function formatCdpException(exceptionDetails) {
  const description = exceptionDetails.exception?.description;
  if (description) {
    return description;
  }
  return exceptionDetails.text ?? "Renderer evaluation failed.";
}

function uiSmokeInRenderer(fixtures, smokeMode) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textMatches = (value, needle) => value.toLowerCase().includes(needle.toLowerCase());

  const waitFor = async (predicate, label, timeoutMs = 60000) => {
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const value = predicate();
        if (value) {
          return value;
        }
      } catch (error) {
        lastError = error;
      }
      await sleep(150);
    }
    throw new Error(`${label} did not become ready.${lastError ? ` Last error: ${lastError.message}` : ""}`);
  };

  const findButton = (root, label) => Array.from(root.querySelectorAll("button"))
    .find((button) => textMatches(button.innerText, label));

  const rowContaining = (needle) => Array.from(document.querySelectorAll('[data-testid="worklist-row"]'))
    .find((row) => textMatches(row.innerText, needle));

  const clickInspect = async (needle) => {
    const row = await waitFor(() => rowContaining(needle), `${needle} worklist row`);
    const button = row.querySelector('[data-testid="inspect-local-study"]');
    if (!button) {
      throw new Error(`Inspect action was missing for ${needle}.`);
    }
    button.click();
    return waitFor(
      () => {
        const panel = document.querySelector('[data-testid="local-assets-panel"]');
        return panel && textMatches(panel.innerText, needle) ? panel : null;
      },
      `${needle} local asset panel`,
    );
  };

  const clickAnalyzeAndWaitFor = async (needles) => {
    const panel = document.querySelector('[data-testid="local-assets-panel"]');
    const button = panel?.querySelector('[data-testid="analyze-local-study"]');
    if (!button) {
      throw new Error("Analyze action was missing for local assets.");
    }
    button.click();
    return waitFor(
      () => {
        const analysisPanel = document.querySelector('[data-testid="local-analysis-panel"]');
        if (!analysisPanel) {
          return null;
        }
        const text = analysisPanel.innerText;
        return needles.every((needle) => textMatches(text, needle)) ? analysisPanel : null;
      },
      `local analysis panel containing ${needles.join(", ")}`,
    );
  };

  const makeFile = (payload) => {
    const binary = atob(payload.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const file = new File([bytes], payload.name, { type: payload.type });
    Object.defineProperty(file, "radsysxRelativePath", {
      configurable: true,
      value: payload.relativePath,
    });
    return file;
  };

  const dispatchDragDropImport = (importPanel) => {
    const transfer = new DataTransfer();
    for (const payload of fixtures) {
      transfer.items.add(makeFile(payload));
    }

    importPanel.dispatchEvent(new DragEvent("dragenter", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }));
    importPanel.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }));
  };

  const clickPickerFolderImport = async (importPanel) => {
    if (!window.radsysxDesktop?.importLocalImaging) {
      throw new Error("Desktop direct local imaging import bridge was not exposed to the renderer.");
    }

    const button = await waitFor(
      () => findButton(importPanel, "Import folder"),
      "desktop Import folder button",
    );
    button.click();
  };

  return (async () => {
    await waitFor(
      () => window.location.pathname === "/worklist" &&
        document.querySelector('[data-testid="local-import-panel"]'),
      "hydrated worklist local import panel",
    );

    const importPanel = document.querySelector('[data-testid="local-import-panel"]');

    if (smokeMode === "picker-folder") {
      await clickPickerFolderImport(importPanel);
    } else {
      dispatchDragDropImport(importPanel);
    }

    const importMessage = await waitFor(
      () => {
        const message = document.querySelector('[data-testid="local-import-message"]')?.textContent ?? "";
        return message.includes("Imported 5 files into 2 local studies") ? message : null;
      },
      "local import success message",
    );

    await waitFor(
      () => rowContaining("Local DICOMDIR import") && rowContaining("Local NIFTI import"),
      "imported local worklist rows",
    );

    const dicomPanel = await clickInspect("Local DICOMDIR import");
    await waitFor(
      () => textMatches(dicomPanel.innerText, "DICOM instances") &&
        textMatches(dicomPanel.innerText, "DICOMDIR files"),
      "DICOMDIR asset summary",
    );
    await clickAnalyzeAndWaitFor(["Intensity range", "0 to 3"]);

    const niftiPanel = await clickInspect("Local NIFTI import");
    await waitFor(
      () => textMatches(niftiPanel.innerText, "NIFTI volume") &&
        textMatches(niftiPanel.innerText, "2 x 3 x 4") &&
        textMatches(niftiPanel.innerText, "Image files"),
      "NIFTI and image asset summary",
    );

    await waitFor(
      () => Array.from(document.querySelectorAll('[data-testid="local-asset-preview"]'))
        .some((image) => image.complete && image.naturalWidth > 0),
      "local preview image load",
    );

    const coronalButton = await waitFor(
      () => findButton(niftiPanel, "coronal"),
      "NIFTI coronal preview control",
    );
    coronalButton.click();
    await waitFor(
      () => Array.from(document.querySelectorAll('[data-testid="local-asset-preview"]'))
        .some((image) => image.src.includes("axis=coronal")),
      "NIFTI coronal preview image URL",
    );

    await clickAnalyzeAndWaitFor(["Voxel count", "24", "Mean intensity", "11.5", "Image dimensions", "1 x 1"]);

    return {
      currentUrl: window.location.href,
      importPath: smokeMode,
      importMessage,
      localRows: Array.from(document.querySelectorAll('[data-testid="worklist-row"]'))
        .filter((row) => textMatches(row.innerText, "Local "))
        .map((row) => row.innerText.split("\\n").slice(0, 3).join(" | ")),
      previewCount: document.querySelectorAll('[data-testid="local-asset-preview"]').length,
    };
  })();
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.eventHandlers = new Map();
    this.pending = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) {
        if (message.method && this.eventHandlers.has(message.method)) {
          for (const handler of this.eventHandlers.get(message.method)) {
            handler(message.params ?? {});
          }
        }
        return;
      }
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
      } else {
        pending.resolve(message.result);
      }
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("CDP socket closed before command completed."));
      }
      this.pending.clear();
    });
  }

  static connect(webSocketDebuggerUrl) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(webSocketDebuggerUrl);
      socket.addEventListener("open", () => resolve(new CdpClient(socket)), { once: true });
      socket.addEventListener("error", () => reject(new Error("Unable to open CDP socket.")), {
        once: true,
      });
    });
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      timeout.unref();
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(payload);
    });
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(method, handlers);
  }

  close() {
    this.socket.close();
  }
}

async function stopDesktopRuntime() {
  if (!desktopProcess || desktopProcess.killed) {
    return;
  }

  const child = desktopProcess;
  if (desktopPublicBaseUrl) {
    try {
      await fetch(`${desktopPublicBaseUrl}/_radsysx/desktop/shutdown`, { method: "POST" });
      await waitForExit(child, 10000);
      return;
    } catch {
      // Fall back to external process termination below.
    }
  }

  terminateProcessGroup(child, "SIGTERM");
  await waitForExit(child, 6000);
  if (!child.killed && child.exitCode == null) {
    terminateProcessGroup(child, "SIGKILL");
    await waitForExit(child, 2000);
  }
}

async function waitForExit(child, timeoutMs) {
  await new Promise((resolve) => {
    if (child.exitCode != null || child.signalCode != null) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, timeoutMs);
    timeout.unref();
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function terminateProcessGroup(child, signal) {
  if (!child.pid || child.killed) {
    return;
  }
  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    // Process already exited.
  }
}

await main();
