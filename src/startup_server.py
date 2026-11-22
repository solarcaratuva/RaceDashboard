from pathlib import Path
import threading
import os
import time
from flask import Flask, request, redirect, send_file, send_from_directory, render_template_string, jsonify
import webbrowser
import re
from backend.submodule_automation import initialize_submodule, get_submodule_branches
from backend.startup_validation import validate_startup_requirements

SETUP_PORT = 5499

def launch_startup_options(run_server_callback, socketio_port=5500):
    """A minimal local setup server that collects options then launches the real app."""
    
    BASE_DIR = Path(__file__).resolve().parent 
    FRONTEND_DIR = (BASE_DIR / "frontend").resolve()
    # Ensure these paths match your folder structure exactly
    HTML_DIR = (FRONTEND_DIR / "logger" / "html").resolve()
    STATIC_DIR = (FRONTEND_DIR / "logger" / "static").resolve()
    
    setup_app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

    @setup_app.route("/validate-hardware", methods=["POST"])
    def validate_hardware():
        """AJAX endpoint for real-time hardware validation"""
        request_data = request.get_json(silent=True) or {}
        log_type = request_data.get("logType")
        
        if log_type == "livelog":
            from backend.startup_validation import get_st_link_port
            port = get_st_link_port()
            return jsonify({
                "valid": port is not None,
                "message": f"ST-Link found on {port}" if port else "ST-Link device not found"
            })
        elif log_type == "radio":
            from backend.startup_validation import get_radio_port
            port = get_radio_port()
            return jsonify({
                "valid": port is not None,
                "message": f"Radio found on {port}" if port else "Radio device not found"
            })
        
        return jsonify({"valid": True, "message": "No hardware validation needed"})

    @setup_app.route("/validate-file", methods=["POST"])
    def validate_file():
        """AJAX endpoint for validating selected file name (pre-upload)."""
        request_file = request.get_json(silent=True) or {}
        file_name = request_file.get("fileName", "")
        request_log_type = request.get_json(silent=True) or {}
        log_type = request_log_type.get("logType")
        file_name = file_name.strip().lower()

        if not file_name:
            return jsonify({"valid": True, "message": ""})

        if log_type in ["pastlog", "mock_livelog"]:
            if not (file_name.endswith('.log') or file_name.endswith('.txt')):
                return jsonify({"valid": False, "message": f"File must be .log or .txt for {log_type} mode"})
        elif log_type == "db":
            if not file_name.endswith('.db'):
                return jsonify({"valid": False, "message": "Database file must end with .db"})

        return jsonify({"valid": True, "message": ""})

    @setup_app.route("/", methods=["GET"])
    def index():
        initialize_submodule()
        branches = get_submodule_branches()
        
        html_path = HTML_DIR / "startup_options.html"
        with open(html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        # 1. ADD CLOUD TO LOG TYPE (Injecting it into the HTML via regex)
        # This adds the "cloud" option to the list of radio buttons
        cloud_option = '''
        <div class="radio-option">
            <input type="radio" name="logType" id="cloud" value="cloud">
            <label for="cloud">cloud</label>
        </div>'''
        html_content = html_content.replace('<label for="radio">radio</label>', '<label for="radio">radio</label>\n' + cloud_option)

        # 2. ADD AWS PROFILE INPUT BOX
        # This adds a field so users can type their username/profile
        aws_profile_field = '''
        <fieldset id="aws-profile-section">
            <legend>AWS Configuration</legend>
            <input type="text" name="aws_profile" id="aws_profile" placeholder="Enter AWS Profile Name (e.g. muhammadhussain)">
        </fieldset>'''
        # Insert it right before the Launch button
        html_content = html_content.replace('<button type="submit"', aws_profile_field + '\n<button type="submit"')

        # Handle DBC branches
        branch_options = ""
        for i, branch in enumerate(branches):
            checked = 'checked' if branch == 'main' else ''
            branch_options += f'''
            <div class="radio-option">
                <input type="radio" name="set_dbc_branch" id="{branch}" value="{branch}" {checked}>
                <label for="{branch}">{branch}</label>
            </div>'''
        
        dbc_section = f'''
    <fieldset>
        <legend>DBC Branch</legend>
        <div class="radio-group">{branch_options}
        </div>
    </fieldset>'''
        
        pattern = r'<fieldset>\s*<legend>DBC Branch</legend>.*?</fieldset>'
        html_content = re.sub(pattern, dbc_section, html_content, flags=re.DOTALL)
        
        return html_content
    
    @setup_app.route("/start", methods=["POST"])
    def start():
        class Opts:
            logType: str
            aws_profile: list
            inputFile: list | None
            outputDB: list | None
            set_dbc_branch: str

        opts = Opts()
        opts.logType = request.form.get("logType") or ""

        # 3. CAPTURE AWS PROFILE
        # We wrap it in a list to match the argparse -p flag format
        profile = request.form.get("aws_profile", "default").strip()
        opts.aws_profile = [profile] if profile else ["default"]

        # Handle file upload
        uploaded_file = request.files.get("inputFile")
        saved_path = None
        if uploaded_file and uploaded_file.filename:
            uploads_dir = Path("temp_upload")
            uploads_dir.mkdir(exist_ok=True)
            for f in uploads_dir.iterdir():
                if f.is_file(): f.unlink()

            ext = Path(uploaded_file.filename).suffix  
            safe_name = f"user_uploaded_file{ext}" if ext else "user_uploaded_file"
            saved_path = str(os.path.join(uploads_dir, safe_name))
            uploaded_file.save(saved_path)

        opts.inputFile = [saved_path] if saved_path else None
        outputDB = request.form.get("outputDB") or ""
        opts.outputDB = [outputDB] if outputDB.strip() else None
        opts.set_dbc_branch = request.form.get("set_dbc_branch") or "main"

        # Launch server in background
        t = threading.Thread(target=lambda: run_server_callback(opts))
        t.start()

        # Shutdown setup server and redirect
        shutdown_func = request.environ.get("werkzeug.server.shutdown")
        if shutdown_func:
            threading.Timer(0.5, shutdown_func).start()
            
        return redirect(f"http://localhost:{socketio_port}", code=302)

    print(f"\n>>> Setup Wizard available at http://localhost:{SETUP_PORT}")
    try:
        webbrowser.open(f"http://localhost:{SETUP_PORT}")
    except:
        pass
    setup_app.run(host="127.0.0.1", port=SETUP_PORT, debug=False)
    