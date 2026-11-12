from . import dbcs
from typing import Any
from cantools.database.can import database

class CanMessage:
    def __init__(self, name: str, id: int, signals: dict, timestamp: float):
        self.messageName = name
        self.messageId = id
        self.sigDict = signals
        self.timeStamp = timestamp

    def __str__(self):
        return f'MessageType: {self.messageName}, MessageID: {self.messageId}, TimeStamp: {self.timeStamp}, Signals: {str(self.sigDict)}'


@staticmethod
def decode_message(id: int, data: bytes, timestamp: float) -> CanMessage | None:
    """
    Decodes the message using previously generated DBCs object

    @param id: The messages's ID as an int
    @param data: The data as a python byte object
    @param timestamp: timestamp of the message stored as float time from start time.

    @return: A CANmessage object (defined above). In sigDict, Signals are the keys and decoded values are the values. Returns None if the message type is not found in the DBC files.
    """
    name = None
    # id = int(id_hex, 16) Old code, kept for reference
    # data = bytes.fromhex(data_hex.replace("0x", ""))
    data += b'\x00' * 8  # adding padding

    decoded_message = None  # dictionary of signals to return

    for db in dbcs.DBCs:
        # Pylance type checking workaround 
        db_obj: Any = db

        for msg in db_obj.messages:
            if msg.frame_id == id:
                name = msg.name
                decoded_message = db_obj.decode_message(id, data)
                break
        if decoded_message is not None:
            break

    # if decoded message was not associated with a definition from DBCs, return None
    if decoded_message is None:
        return None
    if name is None:
        return None

    return CanMessage(name, id, decoded_message, timestamp)
