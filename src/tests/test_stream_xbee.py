import unittest

from backend.sockio.stream_xbee import format_raw_radio_payload


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


if __name__ == "__main__":
    unittest.main()
