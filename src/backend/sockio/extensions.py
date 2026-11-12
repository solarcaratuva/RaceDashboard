# intializes socketIO instance to avoid circular imports
# btwn socket.py and streamRaceData.py

from flask_socketio import SocketIO

socketio = SocketIO(cors_allowed_origins="*")

aws_profile = "default"