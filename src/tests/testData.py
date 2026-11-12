import json

telemetry = {
  "device_id": {
    "S": "$(topic(3))"
  },
  "ts": {
    "N": "1706000000"
  },
  "payload": {
    "M": {
      "ts": {
        "N": "1706000000"
      },
      "status": {
        "S": "Green"
      },
      "voltage": {
        "N": "12.5"
      }
    }
  }
}

  #create output.json file to store telemetry json object
def create_json(obj, filename):
    with open(filename, "w") as file:
        json.dump(obj, file, indent=4)

create_json(telemetry, "telemetry_output.json")

