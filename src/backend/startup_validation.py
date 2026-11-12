"""
Shared validation logic for startup requirements.
Used by both CLI mode and startup server to ensure consistent validation.
"""

import os
import serial.tools.list_ports
from typing import List, Optional


def get_st_link_port() -> Optional[str]:
    """
    Finds the ST-Link's port for livelog mode.
    
    Returns:
        str: Port device path if found, None otherwise
    """
    ports = serial.tools.list_ports.comports()
    for port in ports:
        if "stlink" in port.description.lower() or "st-link" in port.description.lower():
            return port.device
    return None


def get_radio_port() -> Optional[str]:
    """
    Finds the radio's port for radio mode.
    
    Returns:
        str: Port device path if found, None otherwise
    """
    ports = serial.tools.list_ports.comports()
    for port in ports:
        if "FT232R".lower() in port.description.lower():
            return port.device
    return None


def validate_input_file_exists(file_path: Optional[str]) -> bool:
    """
    Validates that the input file exists.
    
    Args:
        file_path: Path to the input file
        
    Returns:
        bool: True if file exists or is None, False otherwise
    """
    if file_path is None:
        return True
    return os.path.exists(file_path)


def validate_startup_requirements(log_type: str, input_file_path: Optional[str]) -> List[str]:
    """
    Validates all startup requirements for the given configuration.
    
    Args:
        log_type: The type of logging mode
        input_file_path: Path to input file (if required)
        
    Returns:
        List[str]: List of validation error messages. Empty list if all validations pass.
    """
    errors = []
    
    # Validate input file requirements
    if log_type in ["pastlog", "mock_livelog"]:
        if not input_file_path:
            errors.append(f"Input file is required for {log_type} mode")
        elif not validate_input_file_exists(input_file_path):
            errors.append(f"Input file does not exist: {input_file_path}")
        elif not (input_file_path.lower().endswith(".txt") or input_file_path.lower().endswith(".log")):
            errors.append(f"Input file must be .txt or .log for {log_type} mode")
    
    elif log_type == "db":
        if not input_file_path:
            errors.append("Input file is required for db mode")
        elif not validate_input_file_exists(input_file_path):
            errors.append(f"Database file does not exist: {input_file_path}")
        elif not input_file_path.endswith(".db"):
            errors.append("Input file must be .db for db mode")
    
    # Validate hardware requirements
    if log_type == "livelog":
        st_link_port = get_st_link_port()
        if not st_link_port:
            errors.append("ST-Link device not found. Please connect ST-Link for livelog mode.")
    
    elif log_type == "radio":
        radio_port = get_radio_port()
        if not radio_port:
            errors.append("Radio device not found. Please connect radio for radio mode.")
    
    return errors