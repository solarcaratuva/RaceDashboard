# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  # UVA Solar Car Race Dashboard

  The React dashboard is the newer dashboard UI for monitoring solar-car telemetry. It is a separate development server from the Python data service: run **both** in separate terminals. The Python process reads or receives CAN data and writes it to SQLite; Vite serves the React UI.

  ## Run Locally

  Run commands from the repository's `src/` directory. Python dependencies and the CAN-message DBC submodule must already be available in the environment.

  Install the frontend dependencies once:

  ```bash
  cd frontend/race
  npm install
  ```

  Then start both processes, each in its own terminal:

  **Terminal 1: backend** (from `src/`; this example replays a log file):

  ```bash
  python main.py mock_livelog --inputFile /path/to/capture.log
  ```

  **Terminal 2: React frontend:**

  ```bash
  cd frontend/race
  npm run dev
  ```

  Open the local URL printed by Vite, usually `http://localhost:5173`. The Python Socket.IO server listens on port `5500`.

  To use another backend input mode, substitute its mode and required file/options in the backend command below. `python main.py` with no arguments starts the legacy setup-options page on port `5499`; it does not start Vite or the React dashboard. The React UI must still be started separately.

  ## Modes

  ### Python launcher (`main.py`)

  `main.py` accepts these case-insensitive positional `logType` values:

  | Mode | Input and behavior |
  | --- | --- |
  | `pastlog` | Requires `--inputFile` pointing to a `.log` or `.txt` capture. Parses the complete file and stores decoded CAN messages. |
  | `livelog` | Reads log-formatted CAN messages from an attached ST-Link serial device. No input file; the device is expected at 921600 baud. |
  | `mock_livelog` | Requires a `.log` or `.txt` capture and replays it as a live source, approximately one line every 0.01 seconds. |
  | `db` | Requires `--inputFile` pointing to an existing `.db` SQLite database. |
  | `radio` | Reads COBS-framed CAN messages from an attached FT232R radio. No input file; baud rate defaults to 9600, parity to `N`, and stop bits to `1.0`. These settings can be overridden with `--baudrate`, `--parity`, and `--stopbits`. |

  Examples:

  ```bash
  python main.py pastlog --inputFile ./captures/run.log
  python main.py mock_livelog --inputFile ./captures/run.log --outputDB ./CANDatabases/replay.db
  python main.py db --inputFile ./CANDatabases/existing.db
  python main.py livelog
  python main.py radio
  python main.py radio --baudrate 19200 --parity E --stopbits 2
  ```

  `--outputDB` selects the SQLite output path for ingestion modes; if omitted, the app creates a timestamped database under `./CANDatabases/`. `db` mode uses the supplied database as its database path. `--set_dbc_branch` chooses the CAN-messages submodule branch and defaults to `main`. Files required by a mode are validated at startup, as are the serial devices for `livelog` and `radio`.

  ### React dashboard

  The React dashboard's supported mode scope is **`cloud`**, **`pastlog`**, and **`mock_livelog`**. It does not expose the Python-only `livelog`, `db`, or `radio` modes. `cloud` is a React-side mode name, not a `main.py` argument.

  There is an important integration boundary in the current checkout: the React component tree does not yet contain a mode selector, cloud client, HTTP data loader, or Socket.IO event listeners. The cards currently render sample values (and the SoC chart uses an in-file sample array). So the mode list describes the React dashboard's intended/current scope, but running the two servers does not currently make the displayed React values live. The Python backend and its legacy logger pages have data routes and Socket.IO events of their own, described below.

  ## Technology

  - **Frontend:** React 19, TypeScript 5.9, Vite 7, Recharts, and `socket.io-client`.
  - **Backend:** Python, Flask, Flask-SocketIO, and SQLite.
  - **CAN ingestion and decoding:** `cantools` loads DBC definitions; `python-can` is used with CAN tooling; `pyserial` reads serial sources; `cobs` decodes radio frames; NumPy supports graph downsampling.
  - **Data storage:** one SQLite table per DBC message type, plus alert tables.

  ## Data Path

  The backend's main path is:

  1. [`main.py`](../../main.py) parses the CLI mode, validates files/devices, initializes the CAN DBC submodule, loads DBC definitions, selects the database path, and starts the Socket.IO server on port `5500`.
  2. A producer reads the selected source. [`logfile_producer.py`](../../backend/input/logfile_producer.py) parses text log lines; [`live_log_producer.py`](../../backend/input/live_log_producer.py) reads log-formatted lines from ST-Link serial; [`radio_producer.py`](../../backend/input/radio_producer.py) reads and COBS-decodes radio frames.
  3. Producers pass CAN ID, bytes, and timestamp to [`consumer.py`](../../backend/input/consumer.py). The consumer calls [`can_message.py`](../../backend/can_message.py) to decode the frame against the loaded DBCs, checks alerts, and queues valid messages.
  4. The consumer writes decoded signal values and timestamps to SQLite through [`db_connection.py`](../../backend/db_connection.py). Live modes drain the queue in batches; `pastlog` processes the complete file and then drains the queue.
  5. [`socket.py`](../../backend/sockio/socket.py) owns the Flask app and Socket.IO server. It registers the shared server instance; feature modules add routes and event handlers to it.

  The DBC definitions control which CAN IDs are recognized, message names/table names, signal names, and decoded values. Startup expects the DBC files under `resources/CAN-messages/` relative to the backend's working directory.

  ## Backend HTTP And Socket.IO

  The Python server exposes its legacy logger pages and data endpoints directly on port `5500`. Important HTTP endpoints include:

  - `GET /get_table_names`: lists SQLite tables.
  - `GET /get_latest_message`: returns the latest row for each message table, including signal values and DBC units.
  - `GET /get_can_message_types`: returns message and signal definitions from the loaded DBCs.
  - `POST /get_visible_range`: returns downsampled graph data for requested signals and a time window.
  - Alert routes include `GET /get_alerts`, `POST /create_alert`, `POST /delete_alert`, and `GET /get_triggered_alerts`.

  Socket.IO events currently defined by the Python backend:

  | Direction | Event | Purpose |
  | --- | --- | --- |
  | Client to server | `request_data_range` | Request downsampled points for one signal and a time window. |
  | Server to client | `data_range_update` | Return the signal's `x`/`y` arrays and request identifier. |
  | Client to server | `request_visible_range` | Request data for multiple signals over a visible time window. |
  | Server to client | `visible_range_update` | Return `x`/`y` arrays for each requested signal. |
  | Server to client | `data_range_error` | Report a graph range request error. |
  | Server to client | `big_popup_event` | Notify connected clients about alert creation or a triggered alert. |
  | Client/server lifecycle | `connect`, `disconnect` | Log Socket.IO client connection and disconnection. |

  The event handlers live in [`graph_view.py`](../../backend/sockio/graph_view.py), alert notifications originate in [`alert_checker.py`](../../backend/alert_checker.py) and [`alert_manager.py`](../../backend/sockio/alert_manager.py), and the Socket.IO app is defined in [`socket.py`](../../backend/sockio/socket.py). A `request_id` is echoed for graph requests where supplied.

  ## React Structure

  [`src/main.tsx`](src/main.tsx) mounts [`App.tsx`](src/App.tsx), which renders the dashboard in [`Dashboard.tsx`](src/components/DashboardCard/Dashboard.tsx). The dashboard is composed from focused cards for primary vehicle information, BPS, motor, diagnostics, and BPS state-of-charge graphing. IMU and GPS components exist but are currently not mounted in the dashboard layout. Card styles are colocated with their components.

  The graph currently uses Recharts with local sample data. `socket.io-client` is installed, but no React component currently imports it or consumes the backend HTTP endpoints. Also, [`vite.config.ts`](vite.config.ts) currently proxies `/api` and `/socket.io` to `localhost:5000`, while `main.py` serves Socket.IO on `5500`; update the proxy and add client data subscriptions before relying on Vite proxying for live backend data.

  ## Frontend Checks

  From `frontend/race/`:

  ```bash
  npm run build
  npm run lint
  ```
