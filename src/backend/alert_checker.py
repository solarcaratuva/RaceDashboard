from .db_connection import DbConnection
from .can_message import CanMessage
from .sockio import socket as socket_module
from .dbcs import get_fault_signals
from datetime import datetime
import json
import threading

socketio = getattr(socket_module, "socketio")


alerts = None
alerts_lock = threading.Lock()


def invalidate_alerts_cache() -> None:
    """Invalidate in-memory alert cache in a thread-safe way."""
    global alerts
    with alerts_lock:
        alerts = None

def fetchActiveAlerts():
    """
    Fetches all active alerts from the database
    """
    global alerts

    with alerts_lock:
        cached_alerts = alerts

    if cached_alerts is not None:
        return cached_alerts

    logger_db = DbConnection()
    query = "SELECT * FROM Alerts"
    fresh_alerts = logger_db.query(query)

    with alerts_lock:
        if alerts is None:
            alerts = fresh_alerts
        return alerts


def checkAlertsAgainstCanMsg(can_message: CanMessage, raw_data: bytes): 
    """
    Checks the given CAN message against all active alerts
    """
    
    logger_db = DbConnection()
    
    # Get all fault signals dynamically from DBC files
    all_faults = get_fault_signals()

    for fault in all_faults:
        if (fault in can_message.sigDict and can_message.sigDict[fault] == 1):
            logger_db.add_triggered_alert(-1, "", datetime.now().strftime('%Y-%m-%d %H:%M:%S'), can_message.messageId, raw_data, can_message.timeStamp, fault, "AUTO FAULT")

            socketio.emit('big_popup_event', {
                'message': f"Auto Fault Triggered: {fault}"
            })

    activeAlerts = fetchActiveAlerts()
    for alert in activeAlerts:
        signal = alert['field']
        alertType = alert['type']
        category = alert['category']

        if alertType == 'bool':
            bool_value = json.loads(alert['bool_value'])
            if signal in can_message.sigDict and can_message.sigDict[signal] == bool_value:
               
                fail_cause = f"BOOL Alert {alert['name']} triggered: {can_message.sigDict[signal]} == {bool_value}"
                logger_db.add_triggered_alert(alert['id'], category, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), can_message.messageId, raw_data, can_message.timeStamp, signal, fail_cause)

                socketio.emit('big_popup_event', {
                    'message': f"Boolean Alert Triggered: {alert['name']}!"
                })
        
        elif alertType == 'int':
            comparisons = json.loads(alert['comparisons_json'])
            for comparison in comparisons:
                if (signal in can_message.sigDict):
                    decoded_val = int(can_message.sigDict[signal])
                    comp_val = int(comparison['value'])
                    operator = comparison['operator']

                    # the alert condition was not met, so no alert should be triggered
                    if not eval(f"{decoded_val} {operator} {comp_val}"):
                        continue                        

                    # the alert condition was met, so trigger the alert
                    fail_cause = f"{decoded_val} {comparison['operator']} {comp_val}"
                    logger_db.add_triggered_alert(alert['id'], category, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), can_message.messageId, raw_data, can_message.timeStamp, signal, fail_cause)
                    socketio.emit('big_popup_event', {
                        'message': f"INT Alert {alert['name']} triggered: {decoded_val} != {comp_val}"
                    })