# UVA Solar Car Race Dashboard

The Race Dashboard is a React and TypeScript interface for monitoring solar-car telemetry. A Python backend ingests CAN data, decodes it using the project's DBC files, stores it in SQLite, and exposes HTTP and Socket.IO interfaces for dashboard clients.

The React dashboard and Python backend run as separate processes but are activated together.

## Quick Start

Install Python dependencies from the project root:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Install the React dependencies once:

```bash
cd src/frontend/race
npm install
```

Start the Dashboard

**Spin-Up Backend & Frontend Simultaneously**

```bash
cd src/frontend/race
npm start
```
Click on the GUI setup link to select input data type and necessary config options
The site will auto redirect to the Race Dashboard. Errors print in the terminal

## Ports

| Port | Service |
| --- | --- |
| `5173` | Vite development server and React dashboard |
| `5500` | Flask and Flask-SocketIO backend |
| `5499` | Legacy startup-options server when `main.py` runs without arguments |

The no-argument command starts the legacy setup UI, not the React development server. Start Vite separately in all cases.

## Technology Stack

- **Frontend:** React 19, TypeScript 5.9, Vite 7, Recharts, and `socket.io-client`
- **Backend:** Python, Flask, Flask-SocketIO, and SQLite
- **CAN decoding:** `cantools` and DBC files in `resources/CAN-messages/`
- **Telemetry inputs:** logfile parsing, ST-Link serial input, and radio input
- **Supporting libraries:** `python-can`, `pyserial`, `cobs`, and NumPy

## Data Paths

### Backend ingestion

```text
src/main.py
    -> source producer/parser
        -> consumer queue
            -> CAN message decoding and alert checks
            -> SQLite database
            -> Flask/Socket.IO API
                -> React dashboard client
```

`main.py` selects the source and starts the matching producer:

| Source | Producer | Behavior |
| --- | --- | --- |
| `pastlog` | `logfile_producer.py` | Parses a complete `.log` or `.txt` capture, then writes decoded messages to SQLite. |
| `mock_livelog` | `logfile_producer.py` | Replays a capture incrementally, approximately one line every `0.01` seconds. |
| `livelog` | `live_log_producer.py` | Reads log-formatted CAN messages from an attached ST-Link at `921600` baud. |
| `radio` | `radio_producer.py` | Reads COBS-framed CAN messages from a radio input. |
| `db` | `main.py` | Opens an existing SQLite database. |

Each producer sends a CAN ID, payload, and timestamp to `consumer.py`. The consumer decodes the frame with `can_message.py` using the loaded DBC files, checks configured alerts, and writes signal values into SQLite through `db_connection.py`. `DbConnection` provides the thread-safe database access used by ingestion and request handlers.

The radio listener reads frames in a loop, decodes them, and places them on the same consumer queue. A future cloud input can feed the same decoded-message path through a cloud event without changing the React-facing API.

### Socket.IO data path

The Flask-SocketIO server in `src/backend/sockio/socket.py` is the real-time communication boundary. Socket.IO handlers query SQLite and emit data payloads for graph and alert clients:

| Event | Direction | Purpose |
| --- | --- | --- |
| `request_data_range` | React/client -> backend | Request one signal over a time range. |
| `data_range_update` | backend -> React/client | Return downsampled `x` and `y` values. |
| `request_visible_range` | React/client -> backend | Request multiple visible signals. |
| `visible_range_update` | backend -> React/client | Return downsampled data for each requested signal. |
| `data_range_error` | backend -> React/client | Report a graph data error. |
| `big_popup_event` | backend -> React/client | Notify clients about alert creation or triggered faults/alerts. |

The backend also provides HTTP routes for table names, latest messages, CAN message definitions, graph ranges, and alert management. Socket.IO and HTTP are both served from port `5500`.

The current React card and graph components still contain sample values, and the React tree does not yet subscribe to the backend Socket.IO events. The event contract above is implemented by the Python backend and is the integration point for live dashboard data. The React dashboard's cloud mode is likewise not yet connected to a cloud event source.

## Backend Commands

`<source_type>` is one of `pastlog`, `mock_livelog`, `livelog`, `radio`, or `db`.

```bash
python3 src/main.py pastlog --inputFile /path/to/capture.log
python3 src/main.py mock_livelog --inputFile /path/to/capture.log --outputDB ./CANDatabases/replay.db
python3 src/main.py livelog
python3 src/main.py radio
python3 src/main.py db --inputFile ./CANDatabases/existing.db
```

Useful flags:

- `-i`, `--inputFile`: capture or SQLite database path, depending on the source
- `-o`, `--outputDB`: output database path; otherwise a timestamped database is created under `CANDatabases/`
- `-b`, `--set_dbc_branch`: DBC submodule branch; defaults to `main`

## Frontend Checks

From `src/frontend/race`:

```bash
npm run build
npm run lint
```
