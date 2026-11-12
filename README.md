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
Click on the GUI setup link to select input data type and necessary config options.
The site will auto redirect to the Race Dashboard. Errors print in the terminal

### Config Options
**Mock**

## Ports

| Port | Service |
| --- | --- |
| `5173` | Vite development server and React dashboard |
| `5500` | Flask and Flask-SocketIO backend |
| `5499` | Legacy startup-options server when `main.py` runs without arguments |

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

| Source | Producer | Behavior | Config Option |
| --- | --- | --- | --- |
| `pastlog` | `logfile_producer.py` | Parses a complete `.log` or `.txt` capture, then writes decoded messages to Dashboard. | File Path
| `mock_livelog` | `logfile_producer.py` | Replays a capture incrementally using timestamps on the log file (falls back to 0.1 sec) | File Path
| `livelog` | `live_log_producer.py` | Reads log-formatted CAN messages from an attached ST-Link at `921600` baud. | None
| `radio` | `radio_producer.py` | Reads CAN messages from an XBEE radio input. | None
| `db` | `main.py` | Opens an existing SQLite database. | File Path

File paths must be relative to repo root. Log options injest both .txt and .log files while DB takes .db files.

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

## Frontend Checks

From `src/frontend/race`:

```bash
npm run build
npm run lint
```
