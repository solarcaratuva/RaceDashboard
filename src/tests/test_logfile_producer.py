import unittest
from datetime import datetime

from backend.input import logfile_producer


class LogfileProducerTests(unittest.TestCase):
    def setUp(self):
        logfile_producer.msIncrementer = 0
        logfile_producer.secondsPrevious = None

    def test_parses_all_supported_can_log_formats(self):
        solar_line = (
            "00:00:01 DEBUG /root/Rivanna2/Common/src/MainCANInterface.cpp:40: "
            "Sent CAN message with ID 0x406 Length 6 Data 0xa41f770200c0"
        )
        coon_line = "687,0x400,2,01 02"
        radio_line = "Radio message ID 0x401 Length 2 Data 0x0304"
        recv_line = (
            "10-18-2026 16:18:27.944,512,RECV,"
            "2C040006025824911304E44CCE00030190010004012C0400030190010004012C040001043BFFFD0366A2000301"
        )

        self.assertEqual(
            logfile_producer.parse_line(solar_line),
            (0x406, bytes.fromhex("a41f770200c0"), 1.0),
        )
        self.assertEqual(
            logfile_producer.parse_line(coon_line),
            (0x400, bytes.fromhex("0102"), 0.687),
        )
        self.assertEqual(
            logfile_producer.parse_line(radio_line),
            (0x401, bytes.fromhex("0304"), None),
        )
        self.assertEqual(
            logfile_producer.parse_line(recv_line),
            (
                512,
                bytes.fromhex(
                    "2C040006025824911304E44CCE00030190010004012C0400030190010004012C040001043BFFFD0366A2000301"
                ),
                datetime.strptime(
                    "10-18-2026 16:18:27.944", "%m-%d-%Y %H:%M:%S.%f"
                ).timestamp(),
            ),
        )

    def test_drops_non_recv_records_in_new_format(self):
        line = "10-18-2026 16:18:27.944,512,SEND,2C040006"

        self.assertIsNone(logfile_producer.parse_line(line))

    def test_rejects_odd_length_payload_in_new_format(self):
        line = "10-18-2026 16:18:27.944,512,RECV,2C04000"

        self.assertIsNone(logfile_producer.parse_line(line))

if __name__ == "__main__":
    unittest.main()
