# src/backend/sockio/socket.py
from flask import Flask, render_template, redirect, jsonify
from backend.sockio.extensions import socketio
from tests.testData import create_json, telemetry
from tests.motorData import stream_motor_data
from backend.cloud.read_dynamodb import dynamo_emit_loop
from backend.sockio.stream_xbee import xbee_emit_loop
SOCKETIO_PORT = 5500
import logging

# Tracks which backend source should be started for Socket.IO connections.
# This is set from main.py before the server starts.
selected_data_type = None

def set_selected_data_type(data_type: str) -> None:
    global selected_data_type
    selected_data_type = data_type

# disable excessive logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# create Flask app
app = Flask(
    __name__,
    template_folder='../../frontend/logger/html',
    static_folder='../../frontend/logger/static'
)

# bind socketio to app
socketio.init_app(app)

@app.route('/')
def index():
    return redirect('/logger')

@app.route('/logger')
def logger_index():
    return render_template('debug_dashboard.html')

@app.route('/api/test')
def test_api():
    return render_template('api_status.html')

@app.route('/api/json')
def test_json():
    create_json(telemetry, "telemetry.json")
    return jsonify(telemetry)

@socketio.on('connect')
def handle_connect():
    print("Client connected.")
    socketio.start_background_task(stream_motor_data)

    # Start one backend data stream task based on the selected source.
    # Cloud uses DynamoDB polling; file and radio inputs emit the backend stream
    # through stream_xbee.py.
    if selected_data_type == "cloud":
        socketio.start_background_task(dynamo_emit_loop)
    elif selected_data_type in ("pastlog", "mock_livelog", "radio"):
        socketio.start_background_task(xbee_emit_loop)

@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected.")
