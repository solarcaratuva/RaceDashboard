import unittest
from unittest.mock import patch

from backend.input.radio_producer import (
    _take_complete_radio_lines,
    listen_to_radio,
    parse_radio_line,
)


class CompleteRadioLineTests(unittest.TestCase):
    def test_extracts_carriage_return_delimited_records_across_chunks(self):
        first_line = (
            b"00:00:00 DEBUG /root/Rivanna2/Common/src/MainCANInterface.cpp:40: "
            b"Sent CAN message with ID 0x406 Length 6 Data 0x24132a0300c0"
        )
        second_line = (
            b"00:00:00 DEBUG /root/Rivanna2/Common/src/MainCANInterface.cpp:40: "
            b"Sent CAN message with ID 0x406 Length 6 Data 0x0019720300c0"
        )
        buffer = bytearray(first_line[:60])

        self.assertEqual(_take_complete_radio_lines(buffer), [])
        self.assertEqual(buffer, first_line[:60])

        buffer.extend(first_line[60:] + b"\r" + second_line[:40])
        first_records = _take_complete_radio_lines(buffer)
        self.assertEqual(first_records, [first_line])
        self.assertEqual(
            parse_radio_line(first_records[0]),
            (0x406, bytes.fromhex("24132a0300c0")),
        )
        self.assertEqual(buffer, second_line[:40])

        buffer.extend(second_line[40:] + b"\r\n")
        second_records = _take_complete_radio_lines(buffer)
        self.assertEqual(second_records, [second_line])
        self.assertEqual(
            parse_radio_line(second_records[0]),
            (0x406, bytes.fromhex("0019720300c0")),
        )
        self.assertEqual(buffer, b"")

    def test_parses_solar_can_log_from_raw_bytes(self):
        line = (
            b"00:00:00 DEBUG /root/Rivanna2/Common/src/MainCANInterface.cpp:40: "
            b"Sent CAN message with ID 0x406 Length 6 Data 0x24132a0300c0"
        )

        self.assertEqual(
            parse_radio_line(line),
            (0x406, bytes.fromhex("24132a0300c0")),
        )

    def test_incomplete_hex_payload_does_not_raise(self):
        line = (
            b"00:00:03 DEBUG /root/Rivanna2/Common/src/MainCANInterface.cpp:40: "
            b"Sent CAN message with ID 0x406 Length 6 Data 0x204e71010"
        )

        self.assertIsNone(parse_radio_line(line))

    def test_retains_partial_line_until_newline_arrives(self):
        buffer = bytearray(b"Radio message ID 0x406 Length 2 Data 0x")

        self.assertEqual(_take_complete_radio_lines(buffer), [])
        self.assertEqual(buffer, b"Radio message ID 0x406 Length 2 Data 0x")

        buffer.extend(b"a41f\r\n")

        self.assertEqual(
            _take_complete_radio_lines(buffer),
            [b"Radio message ID 0x406 Length 2 Data 0xa41f"],
        )
        self.assertEqual(buffer, b"")

    def test_extracts_complete_message_without_newline(self):
        buffer = bytearray(b"Radio message ID 0x406 Length 2 Data 0xa41f")

        self.assertEqual(
            _take_complete_radio_lines(buffer),
            [b"Radio message ID 0x406 Length 2 Data 0xa41f"],
        )
        self.assertEqual(buffer, b"")


class RadioSerialSettingsTests(unittest.TestCase):
    @patch("backend.input.radio_producer.get_radio_port", return_value="COM4")
    @patch("backend.input.radio_producer.Serial")
    def test_passes_parity_and_stopbits_to_serial(self, serial_mock, _port_mock):
        serial_mock.return_value.in_waiting = 1
        serial_mock.return_value.read.side_effect = KeyboardInterrupt

        listen_to_radio(parity="E", stopbits=2.0)

        serial_mock.assert_called_once_with(
            "COM4",
            baudrate=9600,
            timeout=0.1,
            parity="E",
            stopbits=2.0,
        )
        serial_mock.return_value.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
