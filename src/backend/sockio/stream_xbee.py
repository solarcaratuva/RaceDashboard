import time
from queue import Queue, Empty
from backend.sockio.extensions import socketio
from backend.can_message import decode_message

# Event name used for all backend data stream emissions.
BACKEND_DATA_STREAM = "backend_data_stream"

# Keep a separate queue for XBee/radio/frontend events so the SQLite consumer queue is not disturbed.
xbee_queue: Queue[tuple[int | None, bytes, float]] = Queue()


def enqueue_xbee_message(id: int, data: bytes, timestamp: float) -> None:
    """Queue a parsed CAN message for websocket emission without disturbing the SQLite consumer queue."""
    xbee_queue.put((id, data, timestamp))


def enqueue_raw_radio_data(data: bytes, timestamp: float) -> None:
    """Queue exact radio bytes for the frontend, independent of text decoding or CAN parsing."""
    xbee_queue.put((None, data, timestamp))


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


def xbee_emit_loop():
    """Emit queued radio bytes and parsed CAN messages to connected Socket.IO clients."""
    while True:
        batch = []
        while True:
            try:
                id, data, timestamp = xbee_queue.get_nowait()
            except Empty:
                break
            if id is None:
                batch.append(format_raw_radio_payload(data, timestamp))
            else:
                batch.append(format_message_payload(id, data, timestamp))

        if batch:
            socketio.emit(BACKEND_DATA_STREAM, batch)
        socketio.sleep(0.2)  # type: ignore[arg-type]
