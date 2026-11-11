import os
import json
import time
import pika
import psycopg2
from dotenv import load_dotenv
from recommender import log_user_event_to_db

load_dotenv()

# PostgreSQL Credentials
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_NAME = os.getenv("DB_NAME", "products_recommender")

# RabbitMQ Credentials
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "guest")
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "guest")
QUEUE_NAME = "user_events"

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )

def log_event_to_db(event_data):
    """Insert log event data into the PostgreSQL database using shared recommender helper."""
    try:
        conn = get_db_connection()
        
        user_id = event_data.get("user_id")
        event_type = event_data.get("event_type")
        parent_asin = event_data.get("parent_asin")
        details = event_data.get("details")
        timestamp = event_data.get("timestamp")
        
        success = log_user_event_to_db(conn, user_id, event_type, parent_asin, details, timestamp)
        conn.close()
        print(f"[PostgreSQL] Processed event: {event_type} | User: {user_id} | Item: {parent_asin}")
        return success
    except Exception as e:
        print(f"[PostgreSQL ERROR] Failed to write event to DB: {e}")
        return False

def on_message_callback(ch, method, properties, body):
    """Callback triggered when a user event is consumed from the RabbitMQ queue."""
    try:
        event = json.loads(body.decode("utf-8"))
        print(f"[RabbitMQ Consumer] Received message: {event}")
        
        # Log to PostgreSQL
        success = log_event_to_db(event)
        
        if success:
            # Acknowledge that message was successfully processed
            ch.basic_ack(delivery_tag=method.delivery_tag)
        else:
            # Re-queue on database write failure
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
            
    except Exception as e:
        print(f"[Consumer Error] Failed to parse message body: {e}")
        # Acknowledge to drop bad format messages to prevent infinite poison pill loops
        ch.basic_ack(delivery_tag=method.delivery_tag)

def connect_and_consume():
    """Establish connection to RabbitMQ with retry mechanism and start consuming."""
    print("=" * 60)
    print("RABBITMQ BACKGROUND EVENT CONSUMER WORKER")
    print("=" * 60)
    print(f"Connecting to RabbitMQ Broker on {RABBITMQ_HOST}:{RABBITMQ_PORT}...")
    
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300
    )
    
    retry_delay = 2
    while True:
        try:
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()
            
            # Ensure queue exists
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            
            # Set prefetch count to 1 to distribute work evenly across consumers
            channel.basic_qos(prefetch_count=1)
            
            channel.basic_consume(
                queue=QUEUE_NAME,
                on_message_callback=on_message_callback
            )
            
            print(f"[*] Connection established! Subscribed to queue: '{QUEUE_NAME}'")
            print("[*] Waiting for user events. To exit press CTRL+C")
            
            # Start consuming loop
            channel.start_consuming()
            
        except pika.exceptions.AMQPConnectionError as err:
            print(f"[Connection Error] RabbitMQ Broker not reached: {err}")
            print(f"Retrying in {retry_delay} seconds...")
            time.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 60)  # Exponential backoff up to 60s
        except KeyboardInterrupt:
            print("\nShutting down consumer worker...")
            try:
                connection.close()
            except:
                pass
            break
        except Exception as e:
            print(f"[Fatal Exception] Consumer crashed: {e}")
            print(f"Restarting loop in 5 seconds...")
            time.sleep(5)

if __name__ == "__main__":
    connect_and_consume()
