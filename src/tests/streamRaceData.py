import time
from src.backend.sockio.extensions import socketio
#from motorData import motorJSON

def stream_race_data():
    """Simulates a data stream using hard-coded MotorCommands."""
    while True:
        current_ts = str(int(time.time()))
        
        # Your specific DynamoDB-style format
        data = {
            "name": {"S": "motorcommands"},
            "ts": {"N": current_ts},
            "payload": {
                "M": {
                    "throttle_pedal": {"N": "128"},
                    "regen_braking": {"N": "30"},
                    "cruise_speed": {"N": "65"},
                    "cruise_drive": {"N": "50"},
                    "throttle": {"N": "200"},
                    "brake_pedal": {"N": "20"},
                    "manual_drive": {"N": "1"},
                    "regen_drive": {"N": "5"},
                    "braking": {"N": "10"}
                }
            }
        }
        
        # Use the imported socketio instance to push data
        # motor_update is a custom event that will send the data object
        socketio.emit('motor_update', data)
        
        # Flask-SocketIO's sleep is preferred in background tasks
        socketio.sleep(0.1)