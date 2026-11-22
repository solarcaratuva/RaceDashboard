
import serial

#PORT = "/dev/cu.usbserial-AK05ZHD6"
PORT = "usbserial-AK05ZHD6 - 9600/8/N/1/N - AT"
BAUD_RATE = 2026                 # Replace with your configured baud rate

with serial.Serial(PORT, BAUD_RATE, timeout=1) as ser:
    print(f"Listening on {PORT} at {BAUD_RATE} baud...")

    while True:
        data = ser.readline()

        if data:
            print("Received:", repr(data))

