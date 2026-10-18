import time
from serial import Serial
from .logfile_producer import parse_line
from ..sockio.stream_xbee import enqueue_raw_radio_data, enqueue_xbee_message
from ..startup_validation import get_radio_port
from . import consumer

# Radio message pattern
# pattern = r'.+ ID (0x[0-9A-Fa-f]+) Length \d+ Data (0x[0-9A-Fa-f]+)'

def parse_radio_line(line: str | bytes) -> tuple[int, bytes] | None:
    """ Parses a line from the radio's serial output and returns the ID and data.

    This preserves the existing helper while delegating actual parsing
    to logfile_producer.parse_line so the same three formats are recognized.
    Serial data is bytes, but the radio protocol sends ASCII text.
    """

    if isinstance(line, bytes):
        try:
            line = line.decode("ascii")
        except UnicodeDecodeError:
            return None

    try:
        parsed = parse_line(line)
    except ValueError:
        # Ignore incomplete or malformed hex payloads until a valid line arrives.
        return None
    if parsed is None:
        return None

    id_int, data_bytes, _timestamp = parsed
    return (id_int, data_bytes)


def _take_complete_radio_lines(buffer: bytearray) -> list[bytes]:
    """Extract CR/LF-delimited lines and complete messages without a delimiter."""
    lines = []
    while True:
        delimiters = [index for index in (buffer.find(b"\r"), buffer.find(b"\n")) if index >= 0]
        if delimiters:
            delimiter_index = min(delimiters)
            if delimiter_index:
                lines.append(bytes(buffer[:delimiter_index]))
            delimiter = buffer[delimiter_index]
            del buffer[:delimiter_index + 1]
            if delimiter == ord("\r") and buffer.startswith(b"\n"):
                del buffer[:1]
            continue

        if buffer:
            try:
                text = buffer.decode("ascii").strip()
            except UnicodeDecodeError:
                return lines
            if parse_radio_line(text) is not None:
                lines.append(bytes(buffer))
                buffer.clear()
        return lines


def listen_to_radio(parity: str = "N", stopbits: float = 1.0):
    """ Listens to the radio for CAN messages and adds them to the queue. Runs forever"""

    print("Will attempt to get port", flush=True)

    try:
        port = get_radio_port()
    except Exception:
        import traceback
        traceback.print_exc()
        raise
    print(f"get_radio_port() returned: {port!r}", flush=True)
    if port is None:
        print("ERROR: radio not found.", flush=True)
        return
    else:
        print(f"This is the port {port}", flush=True)

    try:
        ser = Serial(port, baudrate=9600, timeout=0.1, parity=parity, stopbits=stopbits)
        print(f"Serial connection to {port} established. Listening...", flush=True)
        pending_line = bytearray()
        next_wait_log = time.monotonic() + 5

        while True:
            try:
                raw_data = ser.read(max(ser.in_waiting, 1))
                if not raw_data:
                    if time.monotonic() >= next_wait_log:
                        print(f"No serial bytes received from {port}; still listening.", flush=True)
                        next_wait_log = time.monotonic() + 5
                    continue
                next_wait_log = time.monotonic() + 5
                print(f"Received {len(raw_data)} bytes from serial port", flush=True)
                timestamp = time.perf_counter() - consumer.start_consume_time
                enqueue_raw_radio_data(raw_data, timestamp)
                pending_line.extend(raw_data)
                for complete_line in _take_complete_radio_lines(pending_line):
                    try:
                        text = complete_line.decode("ascii").strip()
                    except UnicodeDecodeError as e:
                        print(
                            f"Skipping CAN parse for non-ASCII radio data: {complete_line!r} ({e})",
                            flush=True,
                        )
                        continue
                    print(f"Decoded serial line: {text!r}", flush=True)
                    text_tuple = parse_radio_line(text)
                    print(f"Parsed radio line: {text_tuple!r}", flush=True)
                    if text_tuple is None:
                        print("Line did not match a radio message; skipping", flush=True)
                        continue
                    id, data = text_tuple
                    print(f"Dispatching CAN frame id={id:#x}, data={data!r}, timestamp={timestamp}", flush=True)
                    # Emit XBee stream payloads to the frontend while still
                    # sending the same decoded frames into the SQLite queue.
                    enqueue_xbee_message(id, data, timestamp)
                    print("Enqueued XBee stream message", flush=True)
                    consumer.add_to_queue(id, data, timestamp)
                    print("Added CAN frame to consumer queue", flush=True)

            except Exception as e:
                print(f"Serial Read Exception: {e}", flush=True)
    except KeyboardInterrupt:
        ser.close()
        print("Serial connection to radio closed.", flush=True)
