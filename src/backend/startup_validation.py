"""
Shared validation logic for startup requirements.
Used by both CLI mode and startup server to ensure consistent validation.
"""

import os
import serial.tools.list_ports
from typing import List, Optional


def _port_is_radio_like(port) -> bool:
    # Common USB-to-serial chips used by XBee adapters, including Windows COM ports.
    usb_serial_ids = {
        (0x0403, 0x6001),  # FTDI FT232
        (0x10C4, 0xEA60),  # Silicon Labs CP210x
        (0x10C4, 0xEA70),  # Silicon Labs CP210x
        (0x1A86, 0x7523),  # QinHeng CH340
        (0x1A86, 0x5523),  # QinHeng CH341
        (0x067B, 0x2303),  # Prolific PL2303
    }
    vendor_id = getattr(port, "vid", None)
    product_id = getattr(port, "pid", None)
    device = getattr(port, "device", "") or ""
    description = getattr(port, "description", "") or ""
    if (vendor_id, product_id) in usb_serial_ids:
        print(f"[DEBUG] Radio-like port detected by PID/VID: {device} ({description})")
        return True

    metadata = " ".join(
        str(value or "")
        for value in (
            device,
            description,
            getattr(port, "manufacturer", None),
            getattr(port, "product", None),
            getattr(port, "interface", None),
            getattr(port, "hwid", None),
        )
    ).casefold()
    keywords = (
        "usb serial port",
        "usb serial device",
        "usb-to-uart",
        "usb uart",
        "usb to uart",
        "usb-serial",
        "cp210",
        "silicon labs",
        "ft232",
        "ftdi",
        "ch340",
        "ch341",
        "ch910",
        "prolific",
        "pl2303",
        "xbee",
        "digi",
        "uart bridge",
        "radio",
    )
    is_match = any(keyword in metadata for keyword in keywords)
    if is_match:
        print(f"[DEBUG] Radio-like port matched keywords: {device} ({description})")
    else:
        print(f"[DEBUG] Ignoring non-radio port: {device} ({description})")
    return is_match


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

    XBee adapters often enumerate as CP210x / FTDI / USB UART devices instead
    of the literal "USB Serial Port" string used by the original code.
    """
    override = os.environ.get("RACE_RADIO_PORT") or os.environ.get("XBEE_PORT")
    if override:
        print(f"[DEBUG] Using radio port override from environment: {override}")
        return override

    ports = serial.tools.list_ports.comports()
    print(f"[DEBUG] Scanning {len(ports)} serial ports for radio connection")
    for port in ports:
        print(f"[DEBUG] Evaluating serial port candidate: {port.device} | {port.description} | vid={port.vid} pid={port.pid}")
        if _port_is_radio_like(port):
            print(f"[DEBUG] Selected radio port: {port.device}")
            return port.device
    print("[DEBUG] No radio port found")
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
        elif not (input_file_path.endswith(".txt") or input_file_path.endswith(".log")):
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