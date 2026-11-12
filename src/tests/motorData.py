import time
from backend.sockio.extensions import socketio

def stream_motor_data():
    """Simulates a data stream matching the React 'Motor' type."""
    while True:
        current_ts = str(int(time.time()))
        
        # Hard-coded data mapped to your React MotorCard
        # N = Number, S = String, BOOL = Boolean (DynamoDB style)
        motorJSON = {
            "name": {"S": "motorcommands"},
            "ts": {"N": current_ts},
            "payload": {
                "M": {
                    "batteryVoltage": {"N": "96.5"},
                    "batteryCurrent": {"N": "45.2"},
                    "motorCurrent": {"N": "120.0"},
                    "motorRpm": {"N": "4500"},
                    "fetTemp": {"N": "52"},
                    "pwmDuty": {"N": "85"},
                    "acceleratorPosition": {"N": "75"},
                    "regenPosition": {"N": "0"},
                    "powerMode": {"S": "SPORT"},
                    "controlMode": {"S": "TORQUE"},
                    "regenEnabled": {"BOOL": False}
                }
            }
        }
        
        socketio.emit('motor_update', motorJSON)
        socketio.sleep(0.1) # 10Hz refresh rate