import numpy as np
from flask import render_template, jsonify, request
from ..db_connection import DbConnection as dbconnect
from ..dbcs import get_messages_from_dbcs
from ..downsampling import largest_triangle_three_buckets
import numpy as np

from .socket import app, socketio


@socketio.on('request_data_range')
def handle_data_range_request(data):
    """
    Handle requests for data in a specific time range with downsampling.
    
    Args:
        data: Dictionary containing:
            - signal_id: The signal ID to fetch data for
            - start_time: Start time in milliseconds
            - end_time: End time in milliseconds
            - zoom_level: Level of zoom (1-10) to determine downsampling
    """
    try:
        signal_id = data['signal_id']
        start_time = data['start_time']
        end_time = data['end_time']
        zoom_level = data.get('zoom_level', 1)
        viewport_width = data.get('viewport_width', 1200)
        request_id = data.get('request_id')
        
        # Parse signal ID to get message name and signal name
        message_name, signal_name = signal_id.split('.')
        
        # Query the database for the data in the specified range
        db_conn = dbconnect()
        query = f"""
            SELECT {signal_name}, timeStamp 
            FROM {message_name} 
            WHERE timeStamp BETWEEN {start_time} AND {end_time}
            ORDER BY timeStamp
        """
        results = db_conn.query(query)
        
        if not results:
            socketio.emit('data_range_update', {
                'signal_id': signal_id,
                'data': []
            })
            return
        
        # Convert results to numpy array for downsampling and drop NaN/None
        data_points = np.array([(r['timeStamp'], r[signal_name]) for r in results], dtype=float)
        if data_points.size:
            finite_mask = np.isfinite(data_points[:, 0]) & np.isfinite(data_points[:, 1])
            data_points = data_points[finite_mask]
        
        # Calculate number of points to keep based on zoom level and viewport width
        safe_div = max(1, (11 - int(zoom_level)))
        base_points = max(100, len(data_points) // safe_div)
        pixel_cap = max(500, int(3 * int(viewport_width)))
        absolute_cap = 2500
        target_points = min(len(data_points), base_points, pixel_cap, absolute_cap)

        # If rows are extremely large relative to target, pre-sample indices before LTTB to reduce memory/CPU
        if len(data_points) > target_points * 50:
            step = max(1, len(data_points) // (target_points * 20))
            data_points = data_points[::step]
        
        # Apply downsampling
        downsampled_data = largest_triangle_three_buckets(data_points, target_points)
        
        # Send the downsampled data back to the client (compact arrays)
        x = [float(pt[0]) for pt in downsampled_data]
        y = [float(pt[1]) for pt in downsampled_data]
        socketio.emit('data_range_update', {
            'signal_id': signal_id,
            'x': x,
            'y': y,
            'request_id': request_id
        })
        
    except Exception as e:
        socketio.emit('data_range_error', {
            'message': f"Error fetching data: {str(e)}"
        })

@socketio.on('request_visible_range')
def handle_visible_range_request(data):
    """
    Bulk request for multiple signals over a visible time window.
    Expects: {
      signal_ids: ["Message.signal", ...],
      start_time: number (seconds),
      end_time: number (seconds),
      zoom_level: 1..10,
      viewport_width: number,
      request_id: number
    }
    Returns one payload with x/y arrays per signal.
    """
    try:
        signal_ids = data.get('signal_ids', [])
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        zoom_level = data.get('zoom_level', 1)
        viewport_width = data.get('viewport_width', 1200)
        request_id = data.get('request_id')

        if not signal_ids or start_time is None or end_time is None:
            socketio.emit('data_range_error', { 'message': 'Missing required parameters' })
            return

        db_conn = dbconnect()

        # Determine target points per signal using same cap logic
        safe_div = max(1, (11 - int(zoom_level)))
        pixel_cap = max(500, int(3 * int(viewport_width)))
        absolute_cap = 2500

        results_by_signal = {}
        for sid in signal_ids:
            try:
                message_name, signal_name = sid.split('.')
                query = f"""
                    SELECT {signal_name}, timeStamp
                    FROM {message_name}
                    WHERE timeStamp BETWEEN {start_time} AND {end_time}
                    ORDER BY timeStamp
                """
                rows = db_conn.query(query)
                if not rows:
                    results_by_signal[sid] = { 'x': [], 'y': [] }
                    continue
                dp = np.array([(r['timeStamp'], r[signal_name]) for r in rows], dtype=float)
                if dp.size:
                    finite_mask = np.isfinite(dp[:, 0]) & np.isfinite(dp[:, 1])
                    dp = dp[finite_mask]
                base_points = max(100, len(dp) // safe_div)
                target_points = min(len(dp), base_points, pixel_cap, absolute_cap)
                if len(dp) > target_points * 50:
                    step = max(1, len(dp) // (target_points * 20))
                    dp = dp[::step]
                ds = largest_triangle_three_buckets(dp, target_points)
                results_by_signal[sid] = {
                    'x': [float(pt[0]) for pt in ds],
                    'y': [float(pt[1]) for pt in ds]
                }
            except Exception as inner_e:
                results_by_signal[sid] = { 'x': [], 'y': [] }

        socketio.emit('visible_range_update', {
            'signals': results_by_signal,
            'request_id': request_id
        })
    except Exception as e:
        socketio.emit('data_range_error', { 'message': f"Error fetching visible range: {str(e)}" })

@app.route('/logger/graph_view')
def graph_view():
    return render_template('graph_view.html')

@app.route('/link2')
def link2():
    return render_template('link2.html')


@app.route('/get_can_message_types', methods=['GET'])
def get_can_message_types():
    """
    Get all available CAN message types and their signals from all DBC files
    """
    try:
        # Get messages from the already loaded DBC files
        message_types = get_messages_from_dbcs()
        
        # Log what we found
        
        return jsonify({
            "status": "success",
            "message_types": message_types
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/get_visible_range', methods=['POST'])
def get_visible_range():
    """
    REST endpoint for bulk request of multiple signals over a visible time window.
    Replaces the socketio-based approach with HTTP polling.
    
    Expects JSON: {
      signal_ids: ["Message.signal", ...],
      start_time: number (seconds),
      end_time: number (seconds),
      zoom_level: 1..10,
      viewport_width: number
    }
    
    Returns JSON with x/y arrays per signal.
    """
    try:
        data = request.get_json(silent=True) or {}
        signal_ids = data.get('signal_ids', [])
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        zoom_level = data.get('zoom_level', 1)
        viewport_width = data.get('viewport_width', 1200)

        if not signal_ids or start_time is None or end_time is None:
            return jsonify({"status": "error", "message": "Missing required parameters"}), 400

        db_conn = dbconnect()

        # Determine target points per signal using same cap logic as socketio handlers
        safe_div = max(1, (11 - int(zoom_level)))
        pixel_cap = max(500, int(3 * int(viewport_width)))
        absolute_cap = 2500

        results_by_signal = {}
        total_raw_points = 0
        total_processed_points = 0
        
        for sid in signal_ids:
            try:
                message_name, signal_name = sid.split('.')
                query = f"""
                    SELECT {signal_name}, timeStamp
                    FROM {message_name}
                    WHERE timeStamp BETWEEN {start_time} AND {end_time}
                    ORDER BY timeStamp
                """
                rows = db_conn.query(query)
                if not rows:
                    results_by_signal[sid] = { 'x': [], 'y': [] }
                    continue
                
                # Convert to numpy array for downsampling and drop NaN/None
                dp = np.array([(r['timeStamp'], r[signal_name]) for r in rows], dtype=float)
                raw_points = len(dp)
                total_raw_points += raw_points
                
                if dp.size:
                    finite_mask = np.isfinite(dp[:, 0]) & np.isfinite(dp[:, 1])
                    dp = dp[finite_mask]
                
                # Calculate target points
                base_points = max(100, len(dp) // safe_div)
                target_points = min(len(dp), base_points, pixel_cap, absolute_cap)
                
                # Pre-sample if extremely large dataset
                if len(dp) > target_points * 50:
                    step = max(1, len(dp) // (target_points * 20))
                    dp = dp[::step]
                
                # Apply downsampling
                ds = largest_triangle_three_buckets(dp, target_points)
                processed_points = len(ds)
                total_processed_points += processed_points
                
                results_by_signal[sid] = {
                    'x': [float(pt[0]) for pt in ds],
                    'y': [float(pt[1]) for pt in ds]
                }
            except Exception as inner_e:
                results_by_signal[sid] = { 'x': [], 'y': [] }

        if total_raw_points > 0:
            compression_ratio = (1 - total_processed_points / total_raw_points) * 100

        return jsonify({
            "status": "success",
            "signals": results_by_signal
        }), 200
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
