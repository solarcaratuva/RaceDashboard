import threading
import time
from typing import Any


_lock = threading.Lock()
_latest_frames: dict[tuple[int, str], dict[str, Any]] = {}


def publish_can_frame(message: Any, can_id: int, data: bytes) -> None:
    """Cache and broadcast the latest decoded frame for its CAN message."""
    frame = {
        "id": hex(can_id),
        "tag": message.messageName,
        "payload": data.hex(" ").upper(),
        "timestamp": message.timeStamp,
        "receivedAt": time.time(),
        "signals": message.sigDict,
    }

    with _lock:
        _latest_frames[(can_id, message.messageName)] = frame

    from backend.sockio.socket import socketio

    socketio.emit("can_frame", frame)


def get_latest_can_frames() -> list[dict[str, Any]]:
    """Return one most-recent frame per decoded message."""
    with _lock:
        return list(_latest_frames.values())
