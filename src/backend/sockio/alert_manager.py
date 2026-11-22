from flask import render_template, request, jsonify
from .. import alert_checker as alertChecker
from ..db_connection import DbConnection
from .. import dbcs
from .socket import socketio, app


# List to store messages to display on the front end
message_list = list()
alert_definitions = dict() # {1: alert1, 2: alert2, 3: alert3, ...}
alertsCreated = 0


@app.route('/logger/alert_manager')
def alert_manager():
    return render_template('alert_manager.html')


@app.route('/parse_dbc_fields', methods=['POST'])
def parse_dbc_fields():
    """
    Use this to populate the alerts form with available fields from the DBC files
    """

    result = dbcs.get_messages_from_dbcs()

    return jsonify({'message': result})


@app.route('/create_alert', methods=['POST'])
def create_alert():
    global alertsCreated
    global alert_definitions

    logger_db = DbConnection()
    data = request.json 
    
    try:
        alert_id = logger_db.create_alert(data)
        socketio.emit('big_popup_event', {
            'message': 'Request to create alert was triggered.'
        })

        return jsonify({
            "status": "success",
            "message": "Alert created",
            "alert_id": alert_id
        }), 200
    
    except ValueError as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400
    except Exception as e:
        return jsonify({
            "status": "error", 
            "message": f"Failed to create alert: {str(e)}"
        }), 500


@app.route('/get_alerts', methods=['GET'])
def get_alerts():
    alertChecker.fetchActiveAlerts()
    try:
        logger_db = DbConnection()
        query = "SELECT * FROM Alerts"
        alerts = logger_db.query(query)
        return jsonify({"status": "success", "alerts": alerts}), 200
    except Exception as e:
        print(f"Error fetching alerts: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/delete_alert', methods=['POST'])
def delete_alert():
    alert_id = request.json['alert_id']
    logger_db = DbConnection()
    logger_db.delete_alert(alert_id)
    return jsonify({"status": "success", "message": "Alert deleted"}), 200


@app.route('/get_triggered_alerts', methods=['GET'])
def get_triggered_alerts():
    logger_db = DbConnection()
    query = "SELECT * FROM TriggeredAlerts"
    triggered_alerts = logger_db.query(query)
    
    # Convert any bytes in can_message_data to a hex string
    for alert in triggered_alerts:
        if 'can_message_data' in alert and isinstance(alert['can_message_data'], bytes):
            alert['can_message_data'] = alert['can_message_data'].hex()
        alert['name'] = logger_db.get_alert_name(alert['alert_id'])
    
    return jsonify({"status": "success", "triggered_alerts": triggered_alerts}), 200