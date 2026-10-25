import time
from queue import Queue, Empty
from backend.sockio.extensions import socketio
from backend.can_message import decode_message

# Event name used for all backend data stream emissions.
BACKEND_DATA_STREAM = "backend_data_stream"
FALLBACK_REPLAY_INTERVAL = 0.1

# Keep a separate queue for XBee/radio/frontend events so the SQLite consumer queue is not disturbed.
xbee_queue: Queue[tuple[int | None, bytes, float, float | None]] = Queue()
selected_data_type: str | None = None


# imported in main.py, data type set based on user selection
def set_xbee_stream_data_type(data_type: str) -> None:
    global selected_data_type
    selected_data_type = data_type


def enqueue_xbee_message(
    id: int,
    data: bytes,
    timestamp: float,
    replay_timestamp: float | None = None,
) -> None:
    """Queue a parsed CAN message for websocket emission without disturbing the SQLite consumer queue."""
    xbee_queue.put((id, data, timestamp, replay_timestamp))


def enqueue_raw_radio_data(data: bytes, timestamp: float) -> None:
    """Queue exact radio bytes for the frontend, independent of text decoding or CAN parsing."""
    xbee_queue.put((None, data, timestamp, None))


def format_message_payload(id: int, data: bytes, timestamp: float) -> dict:
    """Build a human-readable JSON payload for the frontend."""
    decoded = decode_message(id, data, timestamp)
    payload = {
        "source": "xbee",
        "messageId": hex(id),
        "timestamp": timestamp,
        "rawData": data.hex(),
    }
    if decoded is not None:
        payload["messageName"] = decoded.messageName
        payload["signals"] = decoded.sigDict
    else:
        payload["messageName"] = None
        payload["signals"] = None
    return payload


def format_raw_radio_payload(data: bytes, timestamp: float) -> dict:
    """Represent every received serial byte losslessly as hexadecimal JSON text."""
    return {
        "source": "xbee",
        "messageId": "serial",
        "timestamp": timestamp,
        "rawData": data.hex(),
        "rawEncoding": "hex",
        "messageName": "Radio serial bytes (hex)",
        "signals": None,
    }

"""
If selected_data_type = mock_livelog, this helper is invoked to replay can messages
at the rate they were sent using their timestamps --> 0.1 second fallback if timestamp missing

Paramaters
- timestamp: current message's timestamp
- pervious_timestamp: if present, subtract from current's timestamp for delay calc
- fallback_elapsed: track a running sum of all fallback delays used thus far for future delay calculation
- has_previous_message: no delay needed for 1st message

Returns 
- All info passed to it returned bc its called continously in a loop and must remember its state
tuple[
    float: delay
    (optional) float: prev tiimestamp
    float: fallback elapsed
    boolean: has prev msg
]
"""
def get_replay_delay(
    timestamp: float | None,
    previous_timestamp: float | None,
    fallback_elapsed: float,
    has_previous_message: bool,
) -> tuple[float, float | None, float, bool]:
    """Return pacing delay and updated timestamp state for one replay message."""
    if timestamp is None:
        delay = FALLBACK_REPLAY_INTERVAL if has_previous_message else 0.0
        if previous_timestamp is not None:
            fallback_elapsed += delay
        return delay, previous_timestamp, fallback_elapsed, True

    if previous_timestamp is not None:
        delay = max(0.0, timestamp - previous_timestamp - fallback_elapsed)
    elif has_previous_message:
        delay = FALLBACK_REPLAY_INTERVAL
    else:
    # No delay neccessary for 1st message
        delay = 0.0

    return delay, timestamp, 0.0, True


def xbee_emit_loop():
    """Emit queued radio bytes and parsed CAN messages to connected Socket.IO clients."""
    previous_timestamp = None
    fallback_elapsed = 0.0
    has_previous_message = False

    while True:
        batch = []
        while True:
            try:
                id, data, timestamp, replay_timestamp = xbee_queue.get_nowait()
            except Empty:
                break
            if id is None:
                batch.append(format_raw_radio_payload(data, timestamp))
            else:
                if selected_data_type == "mock_livelog":
                    if batch:
                        socketio.emit(BACKEND_DATA_STREAM, batch)
                        batch = []

                    delay, previous_timestamp, fallback_elapsed, has_previous_message = (
                        get_replay_delay(
                            replay_timestamp,
                            previous_timestamp,
                            fallback_elapsed,
                            has_previous_message,
                        )
                    )
                    if delay:
                        socketio.sleep(delay) # type: ignore
                    socketio.emit(
                        BACKEND_DATA_STREAM,
                        [format_message_payload(id, data, timestamp)],
                    )
                else:
                    batch.append(format_message_payload(id, data, timestamp))

        if batch:
            socketio.emit(BACKEND_DATA_STREAM, batch)
        poll_interval = 0.01 if selected_data_type == "mock_livelog" else 0.2
        socketio.sleep(poll_interval)  # type: ignore[arg-type]
