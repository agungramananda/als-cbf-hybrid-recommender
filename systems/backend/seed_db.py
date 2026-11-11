import os

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_SYSTEMS_DIR = os.path.dirname(_BASE_DIR)
_DATASETS_DIR = os.path.join(_SYSTEMS_DIR, "datasets")
import sys
import json
import argparse
import psycopg2
from psycopg2 import extras
import pandas as pd
import numpy as np
from tqdm import tqdm
from datetime import datetime
import hashlib
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_NAME = os.getenv("DB_NAME", "products_recommender")

PARQUET_PATH = os.getenv("PARQUET_PATH", os.path.join(_DATASETS_DIR, "meta.parquet"))
CSV_PATH = os.getenv("CSV_PATH", os.path.join(_DATASETS_DIR, "reviews.csv"))

def parse_args():
    parser = argparse.ArgumentParser(description="Seed PostgreSQL database from Products dataset.")
    parser.add_argument("--full", action="store_true", help="Load full datasets (495k products, 9.4M ratings). Warning: takes time & space.")
    parser.add_argument("--product-limit", type=int, default=50000, help="Number of products to load in sample mode (default: 50,000)")
    parser.add_argument("--rating-limit", type=int, default=200000, help="Number of ratings to load in sample mode (default: 200,000)")
    return parser.parse_args()

def get_connection(db_name=None):
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=db_name or "postgres"
    )

def setup_database():
    print(f"Connecting to PostgreSQL default database to verify/create '{DB_NAME}'...")
    conn = get_connection()
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Check if database exists
    cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (DB_NAME,))
    exists = cursor.fetchone()
    if not exists:
        print(f"Database '{DB_NAME}' does not exist. Creating...")
        cursor.execute(f'CREATE DATABASE "{DB_NAME}"')
        print(f"Database '{DB_NAME}' created successfully.")
    else:
        print(f"Database '{DB_NAME}' already exists.")
    
    cursor.close()
    conn.close()

def create_schema(conn):
    print("Creating relational database schema...")
    cursor = conn.cursor()
    
    # Drop legacy tables
    cursor.execute("DROP TABLE IF EXISTS user_interactions CASCADE;")
    cursor.execute("DROP TABLE IF EXISTS user_profiles CASCADE;")
    cursor.execute("DROP TABLE IF EXISTS ratings CASCADE;")
    cursor.execute("DROP TABLE IF EXISTS books CASCADE;")
    
    # Drop new schema tables in order of dependencies to ensure clean reset
    cursor.execute("DROP TABLE IF EXISTS order_items CASCADE;")
    cursor.execute("DROP TABLE IF EXISTS orders CASCADE;")
    cursor.execute("DROP TABLE IF EXISTS carts CASCADE;")
    cursor.execute("DROP TABLE IF EXISTS reviews CASCADE;")
    cursor.execute("DROP TABLE IF EXISTS interactions CASCADE;")
    cursor.execute("DROP TABLE IF EXISTS products CASCADE;")
    cursor.execute("DROP TABLE IF EXISTS users CASCADE;")
    
    # 1. Users Table
    cursor.execute("""
    CREATE TABLE users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    """)
    
    # 2. Products Table
    cursor.execute("""
    CREATE TABLE products (
        parent_asin VARCHAR(50) PRIMARY KEY,
        title TEXT,
        description TEXT,
        main_category VARCHAR(255),
        categories TEXT,
        average_rating FLOAT,
        rating_number INTEGER,
        price FLOAT,
        image_url TEXT
    );
    """)
    
    # 3. Interactions Table
    cursor.execute("""
    CREATE TABLE interactions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id VARCHAR(50) NOT NULL REFERENCES products(parent_asin) ON DELETE CASCADE,
        interaction_type VARCHAR(50) NOT NULL, -- view, search, cart, purchase
        timestamp TIMESTAMP NOT NULL
    );
    """)
    
    # 4. Reviews Table
    cursor.execute("""
    CREATE TABLE reviews (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id VARCHAR(50) NOT NULL REFERENCES products(parent_asin) ON DELETE CASCADE,
        rating FLOAT NOT NULL,
        title VARCHAR(255),
        text TEXT,
        verified_purchase BOOLEAN DEFAULT TRUE,
        timestamp TIMESTAMP NOT NULL,
        CONSTRAINT unique_user_product_review UNIQUE (user_id, product_id)
    );
    """)
    
    # 5. Carts Table
    cursor.execute("""
    CREATE TABLE carts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id VARCHAR(50) NOT NULL REFERENCES products(parent_asin) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        CONSTRAINT unique_user_product_cart UNIQUE (user_id, product_id)
    );
    """)
    
    # 6. Orders Table
    cursor.execute("""
    CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        total_price FLOAT NOT NULL,
        status VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP NOT NULL
    );
    """)
    
    # 7. Order Items (Pivot Table)
    cursor.execute("""
    CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id VARCHAR(50) NOT NULL REFERENCES products(parent_asin) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        price_at_purchase FLOAT NOT NULL
    );
    """)
    
    conn.commit()
    cursor.close()
    print("Database schema tables created successfully.")

def seed_default_users(conn):
    print("Seeding default simulation users...")
    cursor = conn.cursor()
    password_hash = hashlib.sha256(b"password").hexdigest()
    
    default_users = [
        ('1234567890', 'Agung Pradana', 'agung@example.com', password_hash),
        ('9876543210', 'Elizabeth Smith', 'elizabeth@example.com', password_hash),
        ('5554443332', 'Guest User', 'guest@example.com', password_hash)
    ]
    
    cursor.executemany(
        """
        INSERT INTO users (id, name, email, password, created_at)
        VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            password = EXCLUDED.password
        """,
        default_users
    )
    conn.commit()
    cursor.close()
    print("Default users seeded successfully.")

def convert_numpy_types(obj):
    if isinstance(obj, np.ndarray):
        return [convert_numpy_types(x) for x in obj]
    elif isinstance(obj, list):
        return [convert_numpy_types(x) for x in obj]
    elif isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    else:
        try:
            if pd.isna(obj):
                return None
        except Exception:
            pass
        return obj

def extract_image_url(images):
    if images is None or len(images) == 0:
        return None
    try:
        first_img = images[0]
        if isinstance(first_img, dict):
            return first_img.get("large") or first_img.get("medium") or first_img.get("small")
        elif hasattr(first_img, "get"):
            return first_img.get("large")
    except Exception:
        pass
    return None

def seed_products(conn, limit=None):
    print("Reading products metadata from parquet...")
    df = pd.read_parquet(PARQUET_PATH, engine="pyarrow")
    
    if limit:
        print(f"Sampling first {limit} products...")
        df = df.iloc[:limit]
        
    print(f"Total products to load: {len(df)}")
    
    cursor = conn.cursor()

    # Prepare data for bulk insert
    insert_data = []
    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Parsing products"):
        parent_asin = row["parent_asin"]
        if isinstance(parent_asin, (list, np.ndarray)):
            parent_asin = str(parent_asin[0]) if len(parent_asin) > 0 else ""
        elif pd.isna(parent_asin):
            parent_asin = ""
        else:
            parent_asin = str(parent_asin)
            
        title = row["title"]
        if isinstance(title, (list, np.ndarray)):
            title = " ".join([str(x) for x in title])
        elif pd.isna(title):
            title = ""
        else:
            title = str(title)
            
        description = row["description"]
        if isinstance(description, (list, np.ndarray)):
            description = " ".join([str(x) for x in description])
        elif pd.isna(description):
            description = ""
        else:
            description = str(description)
            
        average_rating = float(row["average_rating"]) if not pd.isna(row["average_rating"]) else 0.0
        rating_number = int(row["rating_number"]) if not pd.isna(row["rating_number"]) else 0
        price = float(row["price"]) if not pd.isna(row["price"]) else 0.0
        
        # Parse image
        if "image_url" in df.columns:
            image_url = row["image_url"]
            if pd.isna(image_url):
                image_url = None
        elif "images" in df.columns:
            images = convert_numpy_types(row["images"])
            image_url = extract_image_url(images)
        else:
            image_url = None
        
        # Parse categories
        cats = convert_numpy_types(row["categories"])
        if not isinstance(cats, list):
            cats = []
        categories_json = json.dumps(cats)
        
        # Parse main_category
        main_category = None
        if "main_category" in df.columns:
            main_category = row["main_category"]
            if pd.isna(main_category):
                main_category = None
            else:
                main_category = str(main_category)
        
        insert_data.append((
            parent_asin, title, description, main_category, categories_json, average_rating, rating_number, price, image_url
        ))
        
    print("Inserting products into PostgreSQL...")
    query = """
    INSERT INTO products (parent_asin, title, description, main_category, categories, average_rating, rating_number, price, image_url)
    VALUES %s
    ON CONFLICT (parent_asin) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        main_category = EXCLUDED.main_category,
        categories = EXCLUDED.categories,
        average_rating = EXCLUDED.average_rating,
        rating_number = EXCLUDED.rating_number,
        price = EXCLUDED.price,
        image_url = EXCLUDED.image_url
    """
    extras.execute_values(cursor, query, insert_data)
    conn.commit()
    cursor.close()
    print("Products loaded successfully.")
    
    return set(df["parent_asin"].unique())

def seed_ratings(conn, valid_products, limit=None, chunk_size=100000):
    print("Seeding users and reviews from CSV...")
    cursor = conn.cursor()
    
    # Temporarily drop index if exists
    cursor.execute("DROP INDEX IF EXISTS idx_reviews_user;")
    cursor.execute("DROP INDEX IF EXISTS idx_reviews_product;")
    conn.commit()

    user_query = """
    INSERT INTO users (id, name, email, password, created_at)
    VALUES %s
    ON CONFLICT (id) DO NOTHING
    """
    
    product_query = """
    INSERT INTO products (parent_asin, title, description, main_category, categories, average_rating, rating_number, price, image_url)
    VALUES %s
    ON CONFLICT (parent_asin) DO NOTHING
    """
    
    review_query = """
    INSERT INTO reviews (user_id, product_id, rating, title, text, verified_purchase, timestamp)
    VALUES %s
    ON CONFLICT (user_id, product_id) DO NOTHING
    """

    password_hash = hashlib.sha256(b"password").hexdigest()
    reviews_loaded = 0
    reader = pd.read_csv(CSV_PATH, chunksize=chunk_size)

    for chunk in reader:
        # Check ASINs in chunk
        chunk_asins = set(chunk["parent_asin"].dropna().astype(str).unique())
        missing_asins = chunk_asins - valid_products
        
        if missing_asins:
            # Create placeholder products so FK constraints are met
            new_products = []
            for asin in missing_asins:
                new_products.append((
                    asin,
                    f"Product {asin}",
                    "Seeded product from review dataset.",
                    "General",
                    json.dumps(["General"]),
                    4.5,
                    10,
                    29.99,
                    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=60"
                ))
            extras.execute_values(cursor, product_query, new_products)
            conn.commit()
            valid_products.update(missing_asins)
            
        filtered_chunk = chunk[chunk["parent_asin"].astype(str).isin(valid_products)]
        if filtered_chunk.empty:
            continue
            
        # 1. Extract and seed users first to maintain foreign key constraint
        unique_users = filtered_chunk["user_id"].unique()
        user_rows = []
        for uid in unique_users:
            uid_str = str(uid)
            # Skip default simulation users to avoid overwriting them
            if uid_str in ('1234567890', '9876543210', '5554443332'):
                continue
            name = f"User_{uid_str[:8]}"
            email = f"user_{uid_str}@example.com"
            user_rows.append((uid_str, name, email, password_hash, datetime.now()))
            
        if user_rows:
            extras.execute_values(cursor, user_query, user_rows)
            conn.commit()

        # 2. Seed reviews
        review_rows = []
        for _, row in filtered_chunk.iterrows():
            uid_str = str(row["user_id"])
            pid_str = str(row["parent_asin"])
            rating_val = float(row["rating"])
            ts_ms = int(row["timestamp"])
            dt = datetime.fromtimestamp(ts_ms / 1000.0)
            
            review_rows.append((
                uid_str,
                pid_str,
                rating_val,
                "Customer Review",
                "Seeded from historical dataset.",
                True,
                dt
            ))
            
        if review_rows:
            extras.execute_values(cursor, review_query, review_rows)
            conn.commit()
            
        reviews_loaded += len(review_rows)
        print(f"Loaded {reviews_loaded} reviews & user mappings...")
        
        if limit and reviews_loaded >= limit:
            print(f"Reached review sample limit of {limit}.")
            break
            
    print("Creating indexes for speed...")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_rating ON products(average_rating DESC, rating_number DESC);")
    conn.commit()
    cursor.close()
    print("Users and reviews seeded successfully.")

def main():
    args = parse_args()
    
    # 1. Setup Database (Verify / Create)
    try:
        setup_database()
    except Exception as e:
        print(f"Error setting up database: {e}", file=sys.stderr)
        print("Please make sure PostgreSQL is running and credentials are correct.", file=sys.stderr)
        sys.exit(1)
        
    # 2. Connect to database and create schema & seed
    print(f"Connecting to PostgreSQL database '{DB_NAME}'...")
    try:
        conn = get_connection(DB_NAME)
    except Exception as e:
        print(f"Error connecting to database '{DB_NAME}': {e}", file=sys.stderr)
        sys.exit(1)
        
    product_limit = None if args.full else args.product_limit
    rating_limit = None if args.full else args.rating_limit
    
    print("=" * 50)
    if args.full:
        print("SEEDING MODE: FULL DATASET")
    else:
        print(f"SEEDING MODE: SAMPLE ({product_limit} products, {rating_limit} reviews/ratings)")
    print("=" * 50)
    
    try:
        # Create tables first
        create_schema(conn)
        # Seed default users
        seed_default_users(conn)
        # Seed books and reviews
        valid_products = seed_products(conn, limit=product_limit)
        seed_ratings(conn, valid_products, limit=rating_limit)
        print("=" * 50)
        print("PostgreSQL Database seeding completed successfully!")
        print("=" * 50)
    except Exception as e:
        print(f"Error during seeding: {e}", file=sys.stderr)
        raise e
    finally:
        conn.close()

if __name__ == "__main__":
    main()
