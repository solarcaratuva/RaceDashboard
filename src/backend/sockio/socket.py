from flask import Flask, render_template, jsonify, redirect, request
from flask_socketio import SocketIO

# disables excessive debug logging from SocketIO
import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# `app` and `socketio` represent the REST API connection, and are used in other files in sockio/
app = Flask(__name__, template_folder='../../frontend/logger/html', static_folder='../../frontend/logger/static')
socketio = SocketIO(app, cors_allowed_origins="*", logger=False, engineio_logger=False)

@app.route('/')
def index():
    return redirect('/logger')


@app.route('/logger')
def logger_index():
    return render_template('debug_dashboard.html')


@socketio.on('connect')
def handle_connect():
    print("Client connected.")
    from backend.sockio.can_stream import get_latest_can_frames

    for frame in get_latest_can_frames():
        socketio.emit("can_frame", frame, to=request.sid)


@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected.")