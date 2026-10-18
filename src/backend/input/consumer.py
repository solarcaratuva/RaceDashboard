from queue import Queue
import time
from backend.can_message import CanMessage, decode_message
from backend.db_connection import DbConnection
import backend.alert_checker as alertChecker

# shared queue among all producers and this consumer, CanMessage objects
can_queue = Queue()

# Time in seconds to wait before consuming all data from the queue each loop. This is done to prevent excessive database writes
LOOP_TIME = 0.5

# Logic for live data processing
last_consume_time = None  # the last time the consumer consumed data
start_consume_time = time.perf_counter()  # the very first time when consumer started consuming


def add_to_queue(id: int, data: bytes, timestamp: float) -> None:
    """ Decodes and adds a CAN message to the queue, and performs checks """

    can_msg = decode_message(id, data, timestamp)
    if can_msg is None:
        return  # invalid message, do not add to queue

    # perform checks immediately
    alertChecker.checkAlertsAgainstCanMsg(can_msg, data)

    can_queue.put(can_msg)


def process_data() -> None:
    """
    Pops all stored tuples on CAN messages queue (each tuple representing a single CAN message) and adds them into the database

    @return: Nothing, it will just add all CAN messages from the queue into the database
    """

    db_conn = DbConnection()
    list_can_messages = []
    while True:
        if can_queue.empty():
            break
        can_msg = can_queue.get()
        list_can_messages.append(can_msg)

    db_conn.add_batch_can_msg(list_can_messages)


def process_data_live() -> None:
    """
    Pops all stored tuples on CAN messages queue (each tuple representing a single CAN message) and adds them into the database. Runs forever
    """

    global start_consume_time, last_consume_time
    start_consume_time = time.perf_counter()
    db_conn = DbConnection()

    while True:
        last_consume_time = time.perf_counter()
        list_can_messages = []
        while True:
            if can_queue.empty():
                break
            can_msg = can_queue.get()
            list_can_messages.append(can_msg)

        db_conn.add_batch_can_msg(list_can_messages)
        time.sleep(LOOP_TIME)
