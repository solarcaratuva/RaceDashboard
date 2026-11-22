#!/usr/bin/env node
// One-command launcher for the Race Dashboard.
//
//   npm start   (run from src/frontend/race)
//
// Opens a tiny local setup page where you pick the backend params that
// `python3 src/main.py <logType> ...` normally needs on the command line.
// On submit it spawns the Python backend with those params, starts the
// Vite dev server, and auto-redirects the browser into the React dashboard
// once both are up. No extra npm dependencies are used.

import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { pipeline } from "node:stream/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACE_DIR = path.resolve(__dirname, ".."); // src/frontend/race
const REPO_ROOT = path.resolve(RACE_DIR, "../../.."); // project root
const LOG_FILES_DIR = path.join(REPO_ROOT, "resources", "log-files"); // resources/log-files (sample logs for preset dropdown)

const SETUP_PORT = 5498; // distinct from the legacy logger's setup UI (5499)
const BACKEND_PORT = 5500; // matches SOCKETIO_PORT in src/main.py

const LOG_TYPES = ["pastlog", "mock_livelog", "livelog", "radio", "db"];
const FILE_REQUIRED_TYPES = ["pastlog", "mock_livelog", "db"];

// ---------------------------------------------------------------------------
// Shared state, polled by the setup page while the real app boots.
// ---------------------------------------------------------------------------
const state = {
  launching: false,
  backendStarted: false,
  frontendUrl: null,
  error: null,
};

// references to the flask-python server and vite-ts servers respectively
let backendProc = null;
let frontendProc = null;
// Keep uploaded inputs until the backend exits; it may still be reading them after launch.
const uploadedFileDirs = new Set();

function findPython() {
  // Prefer python3, but retain compatibility with systems where only "python" is installed.
  for (const cmd of ["python3", "python"]) {
    const res = spawnSync(cmd, ["--version"]);
    if (!res.error && res.status === 0) return cmd;
  }
  return null;
}

function validate({ logType, inputFile, outputDB, parity, stopbits, baudrate }) {
  const errors = [];
  if (!LOG_TYPES.includes(logType)) {
    errors.push(`Unknown log type: ${logType}`);
    return errors; // nothing else worth checking
  }
  if (logType === "radio") {
    const parityValue = parity == null
      ? ""
      : (typeof parity === "string" ? parity : String(parity)).trim().toUpperCase();
    const stopbitsValue = String(stopbits ?? "").trim();
    const baudrateValue = String(baudrate ?? "").trim();
    if (parityValue && !["N", "E", "O", "M", "S"].includes(parityValue)) {
      errors.push("Parity must be N, E, O, M, or S for radio mode");
    }
    if (stopbitsValue && !["1", "1.0", "1.5", "2"].includes(stopbitsValue)) {
      errors.push("Stop bits must be 1, 1.5, or 2 for radio mode");
    }
    if (baudrateValue && (
      !/^\d+$/.test(baudrateValue) || !Number.isSafeInteger(Number(baudrateValue)) || Number(baudrateValue) <= 0
    )) {
      errors.push("Baud rate must be a positive whole number for radio mode");
    }
  }
  // Normalize suffixes before checking so uppercase extensions behave like lowercase ones.
  if (FILE_REQUIRED_TYPES.includes(logType)) {
    if (!inputFile || !inputFile.trim()) {
      errors.push(`Input file is required for ${logType} mode`);
    } else if (logType === "db" && path.extname(inputFile.trim()).toLowerCase() !== ".db") {
      errors.push("Input file must be .db for db mode");
    } else if (
      logType !== "db" &&
      ![".log", ".txt"].includes(path.extname(inputFile.trim()).toLowerCase())
    ) {
      errors.push(`Input file must be .log or .txt for ${logType} mode`);
    }
  }
  if (outputDB && outputDB.trim() && path.extname(outputDB.trim()).toLowerCase() !== ".db") {
    errors.push("Output DB must be a .db file");
  }
  return errors;
}

// log parsing helper methods to prepare for terminal output
// counteracts vite stylization
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function prefixLog(prefix) {
  return (chunk) => {
    const text = stripAnsi(chunk.toString());
    for (const line of text.split("\n")) {
      if (line.trim().length) console.log(`[${prefix}] ${line}`);
    }
  };
}

function launchApp({ logType, inputFile, outputDB, dbcBranch, parity, stopbits, baudrate }) {
  const python = findPython();
  if (!python) {
    state.error = "Could not find python3 or python on PATH.";
    state.launching = false;
    return;
  }

  const args = [path.join("src", "main.py"), logType];
  // Uploads and manually entered paths both reach main.py through the same CLI option.
  if (inputFile && inputFile.trim()) args.push("--inputFile", inputFile.trim());
  if (outputDB && outputDB.trim()) args.push("--outputDB", outputDB.trim());
  if (dbcBranch && dbcBranch.trim()) args.push("--set_dbc_branch", dbcBranch.trim());
  if (logType === "radio") {
    const parityValue = typeof parity === "string" ? parity.trim().toUpperCase() : "";
    const stopbitsValue = String(stopbits ?? "").trim();
    const baudrateValue = String(baudrate ?? "").trim();
    if (parityValue) args.push("--parity", parityValue);
    if (stopbitsValue) args.push("--stopbits", stopbitsValue);
    if (baudrateValue) args.push("--baudrate", baudrateValue);
  }

  console.log(`\n[launcher] Starting backend: ${python} ${args.join(" ")}`);
  backendProc = spawn(python, args, { cwd: REPO_ROOT });
  backendProc.stdout.on("data", prefixLog("backend"));
  backendProc.stderr.on("data", prefixLog("backend"));
  backendProc.on("exit", (code) => {
    if (!state.frontendUrl && code !== 0 && code !== null) {
      state.error = `Backend exited early (code ${code}). Check the terminal for details.`;
      state.launching = false;
    }
    console.log(`[launcher] Backend process exited (code ${code})`);
    cleanupUploadedFiles();
  });
  state.backendStarted = true;

  console.log("[launcher] Starting Vite dev server: npm run dev");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  frontendProc = spawn(npmCmd, ["run", "dev"], {
    cwd: RACE_DIR,
    shell: process.platform === "win32",
  });
  frontendProc.stderr.on("data", prefixLog("frontend"));
  frontendProc.stdout.on("data", (chunk) => {
    const text = stripAnsi(chunk.toString());
    prefixLog("frontend")(chunk);
    const match = text.match(/Local:\s+(https?:\/\/\S+)/);
    if (match && !state.frontendUrl) {
      state.frontendUrl = match[1];
      console.log(`[launcher] Dashboard ready at ${state.frontendUrl}`);
      // Free up the setup port shortly after the client has had a chance to redirect.
      setTimeout(() => setupServer.close(), 5000);
    }
  });
  frontendProc.on("exit", (code) => {
    if (!state.frontendUrl && code !== 0 && code !== null) {
      state.error = `Frontend dev server exited early (code ${code}).`;
      state.launching = false;
    }
    console.log(`[launcher] Frontend process exited (code ${code})`);
  });
}

function cleanupUploadedFiles() {
  // Remove only per-upload directories created by this launcher instance.
  for (const dir of uploadedFileDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  uploadedFileDirs.clear();
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
      ? ["cmd", ["/c", "start", '""', url]]
      : ["xdg-open", [url]];
  try {
    const child = spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true });
    // Opener binary may not exist (e.g. no xdg-open on some Linux setups).
    // That failure arrives async as an 'error' event, not a throw, so it
    // needs its own listener or Node treats it as an unhandled crash.
    child.on("error", () => {
      // Non-fatal: just use the URL printed to the terminal instead.
    });
    child.unref();
  } catch {
    // Non-fatal: just print the URL below.
  }
}

// ---------------------------------------------------------------------------
// Tiny setup GUI (single self-contained HTML page, no build step).
// ---------------------------------------------------------------------------
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Race Dashboard — Launch Setup</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
    background: #242424; color: rgba(255,255,255,0.87);
  }
  main {
    width: 420px; max-width: calc(100vw - 32px); padding: 32px;
    background: #1a1a1a; border-radius: 12px; border: 1px solid #333;
  }
  h1 { font-size: 1.4em; margin: 0 0 4px; }
  p.sub { margin: 0 0 24px; color: #9a9a9a; font-size: 0.9em; }
  label { display: block; font-size: 0.85em; margin: 16px 0 6px; color: #d0d0d0; }
  select, input {
    width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #444;
    background: #2a2a2a; color: inherit; font-size: 0.95em; font-family: inherit;
  }
  select:focus, input:focus { outline: none; border-color: #646cff; }
  .hint { font-size: 0.78em; color: #888; margin-top: 4px; }
  button {
    width: 100%; margin-top: 24px; padding: 12px; border-radius: 8px; border: none;
    background: #646cff; color: white; font-size: 1em; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #535bf2; }
  button:disabled { background: #444; cursor: default; }
  #errors { margin-top: 16px; color: #ff6b6b; font-size: 0.85em; white-space: pre-line; }
  #status { margin-top: 16px; color: #7dd3fc; font-size: 0.9em; display: none; }
  .field { display: none; }
  .field.visible { display: block; }
</style>
</head>
<body>
<main>
  <h1>Race Dashboard</h1>
  <p class="sub">Choose how to start the backend, then launch the full app.</p>
  <form id="setup-form">
    <label for="logType">Data source</label>
    <select id="logType" name="logType">
      <option value="pastlog">pastlog — replay a full .log/.txt capture</option>
      <option value="mock_livelog" selected>mock_livelog — replay a capture live</option>
      <option value="livelog">livelog — ST-Link serial device</option>
      <option value="radio">radio — radio (FT232R) device</option>
      <option value="db">db — open an existing .db database</option>
    </select>

    <div class="field" id="presetField">
      <label for="presetFile">Sample log file</label>
      <select id="presetFile">
        <option value="">none — enter my own file path below</option>
      </select>
      <div class="hint">Files come from resources/log-files.</div>
    </div>

    <div class="field" id="inputFileField">
      <label for="inputFile" id="inputFileLabel">Input file path</label>
      <input id="inputFile" name="inputFile" type="text" placeholder="/path/to/capture.log" />
      <label for="filePicker">Or choose a file from your computer</label>
      <input id="filePicker" type="file" accept=".log,.txt,.db,.LOG,.TXT,.DB" />
      <div class="hint" id="inputFileHint">Path is relative to repo root. Input a .log or .txt file</div>
      </div>

    <div class="field" id="radioSerialField">
      <label for="parity">Parity</label>
      <input id="parity" name="parity" type="text" placeholder="Leave blank for default: N" />

      <label for="stopbits">Stop bits</label>
      <input id="stopbits" name="stopbits" type="text" placeholder="Leave blank for default: 1.0" />

      <label for="baudrate">Baud rate</label>
      <input id="baudrate" name="baudrate" type="number" min="1" step="1" placeholder="Leave blank for default: 9600" />
    </div>

    <label for="outputDB">Output database (optional)</label>
    <input id="outputDB" name="outputDB" type="text" placeholder="leave blank for a timestamped DB" />

    <label for="dbcBranch">DBC branch</label>
    <input id="dbcBranch" name="dbcBranch" type="text" value="main" />

    <button id="submit-btn" type="submit">Launch dashboard</button>
  </form>
  <div id="errors"></div>
  <div id="status">Starting backend and dashboard…</div>
</main>
<script>
  const FILE_REQUIRED = ["pastlog", "mock_livelog", "db"];
  const logTypeEl = document.getElementById("logType");
  const inputFileField = document.getElementById("inputFileField");
  const inputFileHint = document.getElementById("inputFileHint");
  const inputFileEl = document.getElementById("inputFile");
  const filePickerEl = document.getElementById("filePicker");
  const radioSerialField = document.getElementById("radioSerialField");
  const parityEl = document.getElementById("parity");
  const stopbitsEl = document.getElementById("stopbits");
  const form = document.getElementById("setup-form");
  const errorsEl = document.getElementById("errors");
  const statusEl = document.getElementById("status");
  const submitBtn = document.getElementById("submit-btn");
  const presetField = document.getElementById("presetField");
  const presetEl = document.getElementById("presetFile");
  const inputFileLabel = document.getElementById("inputFileLabel");

  // Populate the preset dropdown from files discovered by the local launcher.
  async function loadPresets() {
    try {
      const res = await fetch("/log-files");
      const files = await res.json();
      files.forEach((file) => {
        var newOption = document.createElement("option");
        newOption.value = file;
        newOption.textContent = file;
        presetEl.appendChild(newOption);
      });
    } catch {
      // dropdown keeps only the "none" option
    }
  }

  // Keep file controls and required-field validation in sync with the selected data source.
  function syncFields() {
    const needsFile = FILE_REQUIRED.includes(logTypeEl.value);
    const allowsPreset = logTypeEl.value === "pastlog" || logTypeEl.value === "mock_livelog";
    inputFileField.classList.toggle("visible", needsFile);
    presetField.classList.toggle("visible", allowsPreset);
    radioSerialField.classList.toggle("visible", logTypeEl.value === "radio");
    if (!allowsPreset) {
      presetEl.value = "";
    }
    inputFileEl.required = needsFile && !presetEl.value && !filePickerEl.files.length;
    inputFileLabel.textContent = allowsPreset
      ? "Or enter your own file path"
      : "Input file path";
    inputFileHint.textContent = logTypeEl.value === "db"
      ? "Path is relative to repo root. Input a .db SQLite database"
      : "Path is relative to repo root. Input a .log or .txt file";
  }
  logTypeEl.addEventListener("change", syncFields);
  presetEl.addEventListener("change", () => {
    // A user-selected preset takes precedence over a previously selected local file.
    if (presetEl.value) filePickerEl.value = "";
    syncFields();
  });
  inputFileEl.addEventListener("input", () => {
    // Avoid sending two competing input choices with the form.
    filePickerEl.value = "";
  });
  filePickerEl.addEventListener("change", () => {
    if (filePickerEl.files.length) {
      inputFileEl.value = "";
      presetEl.value = "";
    }
    syncFields();
  });
  syncFields();
  loadPresets();

  // Upload a browser-selected file first, then submit its temporary path with the launch options.
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorsEl.textContent = "";
    let inputFile = inputFileEl.value.trim();
    if (!inputFile && presetEl.value) {
      inputFile = "resources/log-files/" + presetEl.value;
    }
    const selectedFile = filePickerEl.files[0];
    if (selectedFile) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Uploading file…";
      try {
        // Browsers do not expose the selected file's local path, so send its bytes to the launcher.
        const uploadRes = await fetch("/upload?name=" + encodeURIComponent(selectedFile.name), {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: selectedFile,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          errorsEl.textContent = uploadData.error || "Could not upload the selected file.";
          submitBtn.disabled = false;
          submitBtn.textContent = "Launch dashboard";
          return;
        }
        inputFile = uploadData.filePath;
      } catch (err) {
        errorsEl.textContent = "Could not upload the selected file: " + err;
        submitBtn.disabled = false;
        submitBtn.textContent = "Launch dashboard";
        return;
      }
    }
    const payload = {
      logType: logTypeEl.value,
      inputFile,
      outputDB: document.getElementById("outputDB").value,
      dbcBranch: document.getElementById("dbcBranch").value,
      parity: parityEl.value,
      stopbits: stopbitsEl.value,
      baudrate: document.getElementById("baudrate").value,
    };
    submitBtn.disabled = true;
    submitBtn.textContent = "Launching…";
    try {
      const res = await fetch("/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        errorsEl.textContent = (data.errors || [data.error || "Unknown error"]).join("\\n");
        submitBtn.disabled = false;
        submitBtn.textContent = "Launch dashboard";
        return;
      }
      form.style.display = "none";
      statusEl.style.display = "block";
      poll();
    } catch (err) {
      errorsEl.textContent = "Could not reach the setup server: " + err;
      submitBtn.disabled = false;
      submitBtn.textContent = "Launch dashboard";
    }
  });

  // The setup page stays open while child processes start, then redirects to Vite when ready.
  async function poll() {
    try {
      const res = await fetch("/status");
      const data = await res.json();
      if (data.error) {
        statusEl.style.display = "none";
        form.style.display = "block";
        errorsEl.textContent = data.error;
        submitBtn.disabled = false;
        submitBtn.textContent = "Launch dashboard";
        return;
      }
      if (data.frontendUrl) {
        statusEl.textContent = "Dashboard ready — redirecting…";
        window.location.href = data.frontendUrl;
        return;
      }
      statusEl.textContent = data.backendStarted
        ? "Backend starting, waiting on the dashboard dev server…"
        : "Starting backend…";
    } catch {
      // setup server may have already shut itself down after a redirect
    }
    setTimeout(poll, 600);
  }
</script>
</body>
</html>`;

const setupServer = http.createServer((req, res) => {
  // Serve the self-contained setup page and the small JSON endpoints it uses.
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGE);
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }

  if (req.method === "GET" && req.url === "/log-files") {
    // Sample presets are limited to supported log formats; compare extensions without case sensitivity.
    let files = [];
    try {
      files = fs.readdirSync(LOG_FILES_DIR)
        .filter((name) => [".log", ".txt"].includes(path.extname(name).toLowerCase()))
        .sort();
    } catch {
      // Non-fatal: shows empty dropdown if no log files exist under log-files folder
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(files));
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/upload?")) {
    const url = new URL(req.url, "http://localhost");
    const name = url.searchParams.get("name") || "";
    // Use only the normalized extension in the temporary filename, never the client-supplied name.
    const extension = path.extname(name).toLowerCase();
    if (![".log", ".txt", ".db"].includes(extension)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Selected file must be .log, .txt, or .db." }));
      req.resume();
      return;
    }

    (async () => {
      let uploadDir;
      try {
        // Store uploads outside the repository and give each one an isolated directory.
        uploadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "race-dashboard-"));
        uploadedFileDirs.add(uploadDir);
        const filePath = path.join(uploadDir, `input${extension}`);
        // Stream the request body to disk so large captures don't need to be buffered in memory.
        await pipeline(req, fs.createWriteStream(filePath, { flags: "wx" }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ filePath }));
      } catch (error) {
        // Do not leave a partial upload behind if creating or writing the temp file fails.
        if (uploadDir) {
          fs.rmSync(uploadDir, { recursive: true, force: true });
          uploadedFileDirs.delete(uploadDir);
        }
        console.error("[launcher] Failed to save uploaded file:", error);
        if (!res.headersSent && !res.destroyed) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Could not save the selected file." }));
        }
      }
    })();
    return;
  }

  if (req.method === "POST" && req.url === "/start") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (state.launching) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Already launching." }));
        return;
      }
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ errors: ["Malformed request."] }));
        return;
      }
      const errors = validate(params);
      if (errors.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ errors }));
        return;
      }
      // Report acceptance before spawning processes; the page polls /status for startup results.
      state.launching = true;
      state.error = null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      launchApp(params);
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

setupServer.listen(SETUP_PORT, () => {
  const url = `http://localhost:${SETUP_PORT}`;
  console.log(`[launcher] Setup GUI running at ${url}`);
  console.log(`[launcher] Backend will run on port ${BACKEND_PORT} once launched.`);
  openBrowser(url);
});

function shutdown() {
  console.log("\n[launcher] Shutting down…");
  if (backendProc) backendProc.kill("SIGTERM");
  if (frontendProc) frontendProc.kill("SIGTERM");
  setupServer.close();
  // SIGTERM may not trigger the backend exit handler, so clean uploads explicitly here too.
  cleanupUploadedFiles();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);