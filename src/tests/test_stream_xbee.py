import unittest

from backend.sockio.stream_xbee import format_raw_radio_payload, get_replay_delay


class RawRadioPayloadTests(unittest.TestCase):
    def test_formats_arbitrary_serial_bytes_as_lossless_hex(self):
        raw_bytes = bytes(range(256))

        payload = format_raw_radio_payload(raw_bytes, 12.5)

        self.assertEqual(payload["source"], "xbee")
        self.assertEqual(payload["messageId"], "serial")
        self.assertEqual(payload["timestamp"], 12.5)
        self.assertEqual(payload["rawData"], raw_bytes.hex())
        self.assertEqual(payload["rawEncoding"], "hex")
        self.assertEqual(payload["messageName"], "Radio serial bytes (hex)")
        self.assertIsNone(payload["signals"])

    def test_replay_delay_uses_timestamp_differences(self):
        delay, previous_timestamp, fallback_elapsed, has_previous = get_replay_delay(
            10.0, None, 0.0, False
        )
        self.assertEqual(
            (delay, previous_timestamp, fallback_elapsed, has_previous),
            (0.0, 10.0, 0.0, True),
        )

        delay, previous_timestamp, fallback_elapsed, has_previous = get_replay_delay(
            11.5, previous_timestamp, fallback_elapsed, has_previous
        )
        self.assertEqual(
            (delay, previous_timestamp, fallback_elapsed, has_previous),
            (1.5, 11.5, 0.0, True),
        )

    def test_replay_delay_falls_back_for_missing_timestamps(self):
        delay, previous_timestamp, fallback_elapsed, has_previous = get_replay_delay(
            10.0, None, 0.0, False
        )
        self.assertEqual(delay, 0.0)

        delay, previous_timestamp, fallback_elapsed, has_previous = get_replay_delay(
            None, previous_timestamp, fallback_elapsed, has_previous
        )
        self.assertEqual((delay, previous_timestamp, fallback_elapsed), (0.1, 10.0, 0.1))

        delay, previous_timestamp, fallback_elapsed, has_previous = get_replay_delay(
            12.0, previous_timestamp, fallback_elapsed, has_previous
        )
        self.assertEqual((delay, previous_timestamp, fallback_elapsed), (1.9, 12.0, 0.0))

    def test_replay_delay_uses_fallback_for_all_untimestamped_messages(self):
        delay, previous_timestamp, fallback_elapsed, has_previous = get_replay_delay(
            None, None, 0.0, False
        )
        self.assertEqual(
            (delay, previous_timestamp, fallback_elapsed, has_previous),
            (0.0, None, 0.0, True),
        )

        delay, previous_timestamp, fallback_elapsed, has_previous = get_replay_delay(
            None, previous_timestamp, fallback_elapsed, has_previous
        )
        self.assertEqual(
            (delay, previous_timestamp, fallback_elapsed, has_previous),
            (0.1, None, 0.0, True),
        )


if __name__ == "__main__":
    unittest.main()
