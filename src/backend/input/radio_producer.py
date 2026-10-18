import time
from serial import Serial
from .logfile_producer import parse_line
from ..sockio.stream_xbee import enqueue_xbee_message
from ..startup_validation import get_radio_port
from . import consumer

# Radio message pattern
# pattern = r'.+ ID (0x[0-9A-Fa-f]+) Length \d+ Data (0x[0-9A-Fa-f]+)'

def parse_radio_line(line: str) -> tuple[int, bytes] | None:
    """ Parses a line from the radio's serial output and returns the ID and data.

    This preserves the existing helper while delegating actual parsing
    to logfile_producer.parse_line so the same three formats are recognized.
    """

    parsed = parse_line(line)
    if parsed is None:
        return None

    id_int, data_bytes, _timestamp = parsed
    return (id_int, data_bytes)

def listen_to_radio():
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
        ser = Serial(port, baudrate=9600)
        print(f"Serial connection to {port} established. Listening...", flush=True)

        while True:
            try:
                print("Waiting for serial data...", flush=True)
                raw_line = ser.readline()
                print(f"Received {len(raw_line)} bytes from serial port", flush=True)
                text = raw_line.decode("utf-8").strip()
                print(f"Decoded serial line: {text!r}", flush=True)
                if text is None:
                    print("Decoded text is None; skipping line", flush=True)
                    continue
                text_tuple = parse_radio_line(text)
                print(f"Parsed radio line: {text_tuple!r}", flush=True)
                if text_tuple is None:
                    print("Line did not match a radio message; skipping", flush=True)
                    continue
                id, data = text_tuple
                timestamp = time.perf_counter() - consumer.start_consume_time
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
