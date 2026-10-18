import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.startup_validation import (
    _port_is_radio_like,
    get_radio_port,
    validate_startup_requirements,
)


class RadioPortDetectionTests(unittest.TestCase):
    def test_recognizes_windows_ch340_com_port_from_description(self):
        port = SimpleNamespace(
            device="COM7",
            description="USB-SERIAL CH340 (COM7)",
            vid=None,
            pid=None,
        )

        self.assertTrue(_port_is_radio_like(port))

    def test_recognizes_usb_serial_adapter_from_windows_usb_id(self):
        port = SimpleNamespace(
            device="COM4",
            description="USB Serial Device (COM4)",
            vid=0x10C4,
            pid=0xEA60,
        )

        self.assertTrue(_port_is_radio_like(port))

    def test_uses_adapter_metadata_when_description_is_generic(self):
        port = SimpleNamespace(
            device="COM5",
            description="Serial Device",
            manufacturer="Digi International",
            vid=None,
            pid=None,
        )

        self.assertTrue(_port_is_radio_like(port))

    def test_does_not_match_unrelated_windows_com_port(self):
        port = SimpleNamespace(
            device="COM2",
            description="Communications Port",
            vid=None,
            pid=None,
        )

        self.assertFalse(_port_is_radio_like(port))

    @patch.dict("os.environ", {"RACE_RADIO_PORT": "COM9"})
    @patch("backend.startup_validation.serial.tools.list_ports.comports")
    def test_environment_override_takes_precedence(self, comports):
        self.assertEqual(get_radio_port(), "COM9")
        comports.assert_not_called()

    @patch("backend.startup_validation.get_radio_port", return_value=None)
    def test_radio_mode_reports_missing_radio(self, _get_radio_port):
        self.assertEqual(
            validate_startup_requirements("radio", None),
            ["Radio device not found. Please connect radio for radio mode."],
        )


if __name__ == "__main__":
    unittest.main()
