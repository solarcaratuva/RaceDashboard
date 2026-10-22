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

function findPython() {
  for (const cmd of ["python3", "python"]) {
    const res = spawnSync(cmd, ["--version"]);
    if (!res.error && res.status === 0) return cmd;
  }
  return null;
}

function validate({ logType, inputFile, outputDB }) {
  const errors = [];
  if (!LOG_TYPES.includes(logType)) {
    errors.push(`Unknown log type: ${logType}`);
    return errors; // nothing else worth checking
  }
  if (FILE_REQUIRED_TYPES.includes(logType)) {
    if (!inputFile || !inputFile.trim()) {
      errors.push(`Input file is required for ${logType} mode`);
    } else if (logType === "db" && !inputFile.trim().endsWith(".db")) {
      errors.push("Input file must be .db for db mode");
    } else if (
      logType !== "db" &&
      !(inputFile.trim().endsWith(".log") || inputFile.trim().endsWith(".txt"))
    ) {
      errors.push(`Input file must be .log or .txt for ${logType} mode`);
    }
  }
  if (outputDB && outputDB.trim() && !outputDB.trim().endsWith(".db")) {
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

function launchApp({ logType, inputFile, outputDB, dbcBranch }) {
  const python = findPython();
  if (!python) {
    state.error = "Could not find python3 or python on PATH.";
    state.launching = false;
    return;
  }

  const args = [path.join("src", "main.py"), logType];
  if (inputFile && inputFile.trim()) args.push("--inputFile", inputFile.trim());
  if (outputDB && outputDB.trim()) args.push("--outputDB", outputDB.trim());
  if (dbcBranch && dbcBranch.trim()) args.push("--set_dbc_branch", dbcBranch.trim());

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
  });
  state.backendStarted = true;

  console.log("[launcher] Starting Vite dev server: npm run dev");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  frontendProc = spawn(npmCmd, ["run", "dev"], { cwd: RACE_DIR });
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
      <div class="hint" id="inputFileHint">Path is relative to repo root. Input a .log or .txt file</div>
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
  const form = document.getElementById("setup-form");
  const errorsEl = document.getElementById("errors");
  const statusEl = document.getElementById("status");
  const submitBtn = document.getElementById("submit-btn");
  const presetField = document.getElementById("presetField");
  const presetEl = document.getElementById("presetFile");
  const inputFileLabel = document.getElementById("inputFileLabel");

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

  function syncFields() {
    const needsFile = FILE_REQUIRED.includes(logTypeEl.value);
    const allowsPreset = logTypeEl.value === "pastlog" || logTypeEl.value === "mock_livelog";
    inputFileField.classList.toggle("visible", needsFile);
    presetField.classList.toggle("visible", allowsPreset);
    if (!allowsPreset) {
      presetEl.value = "";
    }
    inputFileEl.required = needsFile && !presetEl.value;
    inputFileLabel.textContent = allowsPreset
      ? "Or enter your own file path"
      : "Input file path";
    inputFileHint.textContent = logTypeEl.value === "db"
      ? "Path is relative to repo root. Input a .db SQLite database"
      : "Path is relative to repo root. Input a .log or .txt file";
  }
  logTypeEl.addEventListener("change", syncFields);
  presetEl.addEventListener("change", syncFields);
  syncFields();
  loadPresets();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorsEl.textContent = "";
    let inputFile = inputFileEl.value.trim();
    if (!inputFile && presetEl.value) {
      inputFile = "resources/log-files/" + presetEl.value;
    }
    const payload = {
      logType: logTypeEl.value,
      inputFile,
      outputDB: document.getElementById("outputDB").value,
      dbcBranch: document.getElementById("dbcBranch").value,
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
    let files = [];
    try {
      files = fs.readdirSync(LOG_FILES_DIR).filter((name) => name.endsWith(".log") || name.endsWith(".txt")).sort();
    } catch {
      // Non-fatal: shows empty dropdown if no log files exist under log-files folder
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(files));
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
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
