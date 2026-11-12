#contains pull_cloud_db() method that returns evertyhing in the
#SolarTelemetry table on dynamoDB

import boto3
import json
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ProfileNotFound, NoCredentialsError, ClientError
from backend.sockio import extensions
from backend.sockio.extensions import socketio
from backend.sockio.stream_xbee import BACKEND_DATA_STREAM
import decimal

# helper function to avoid JSON dumps error with decimal values
def decimal_to_float(obj):
	if isinstance(obj,decimal.Decimal):
		return float(obj)
	raise TypeError


def make_json_safe(obj):
    if isinstance(obj, list):
        return [make_json_safe(item) for item in obj]
    if isinstance(obj, dict):
        return {key: make_json_safe(value) for key, value in obj.items()}
    if isinstance(obj, decimal.Decimal):
        # choose int if it's a whole number, else float
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    return obj

REGION = "us-east-1"
TABLE_NAME = "SolarTelemetry"

deserializer = TypeDeserializer()

def deserialize(item):
    return {k: deserializer.deserialize(v) for k, v in item.items()}

def pull_cloud_db(profile_name=None):
    print("STARTING PULL CLOUD DB FUNCTION")
    # Get username - allow passing it in or prompting
    if profile_name is None:
        PROFILE = input("Enter username: ").strip()
    else:
        PROFILE = profile_name.strip()
    
    if not PROFILE:
        print("Error: Username cannot be empty")
        return None
    
    try:
        # Try to create session with the profile
        session = boto3.Session(profile_name=PROFILE, region_name=REGION)
        ddb = session.client("dynamodb")
        
    except ProfileNotFound:
        print(f"Error: AWS profile '{PROFILE}' not found in your credentials")
        print(f"Run 'aws configure --profile {PROFILE}' to set it up")
        return None
        
    except NoCredentialsError:
        print("Error: No AWS credentials found")
        print("Run 'aws configure' to set up credentials")
        return None
    
    try:
        # Try to scan the table
        response = ddb.scan(TableName=TABLE_NAME)
        items = response.get("Items", [])
        
        print(f"Found {len(items)} items")
        
        # Deserialize all items into a list
        parsed_items = [deserialize(raw_item) for raw_item in items]
        
        # Return direct JSON pulled from DynamoBD
        result = [parsed_items, PROFILE]
        
        print("\n" + "="*50)
        print("PARSED DATA:")
        print("="*50)
        print(make_json_safe(parsed_items))
        
        return make_json_safe(parsed_items)
            
    except ClientError as e:
        error_code = e.response['Error']['Code']
        
        if error_code == 'ResourceNotFoundException':
            print(f"Error: Table '{TABLE_NAME}' does not exist in region {REGION}")
        elif error_code == 'AccessDeniedException':
            print(f"Error: No permission to access table '{TABLE_NAME}'")
        else:
            print(f"AWS Error: {e.response['Error']['Message']}")
        
        return None
            
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return None

def dynamo_emit_loop():
    """Continuously poll DynamoDB and emit backend stream data."""
    while True:
        parsed_items = pull_cloud_db(extensions.aws_profile)
        if parsed_items is not None:
            socketio.emit(BACKEND_DATA_STREAM, parsed_items)
        socketio.sleep(1.0)

