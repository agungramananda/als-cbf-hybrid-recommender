import os
import json
import time
import psycopg2
import numpy as np
import pandas as pd
import math
from datetime import datetime
import hashlib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from dotenv import load_dotenv
from nltk.stem import PorterStemmer
import re
import html

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_NAME = os.getenv("DB_NAME", "products_recommender")

# Vector Database is dropped, setting client to None for backward compatibility
chroma_client = None


def clean_float(val):
    """Ensure float values are JSON compliant and do not contain NaN or Infinity."""
    if val is None:
        return 0.0
    try:
        fval = float(val)
        if math.isnan(fval) or math.isinf(fval):
            return 0.0
        return fval
    except (ValueError, TypeError):
        return 0.0

def format_product_dict(row, score=0.0, cf_score=0.0, cbf_score=0.0):
    cats = row["categories"]
    if isinstance(cats, str):
        try:
            categories_list = json.loads(cats)
        except Exception:
            categories_list = []
    else:
        categories_list = cats or []

    price_val = clean_float(row["price"])
    price_str = f"${price_val:.2f}" if price_val > 0 else "$14.99"

    return {
        "item_id": row["parent_asin"],
        "title": row["title"],
        "main_category": row["main_category"] or "General",
        "description": row["description"] or "No description available.",
        "categories": categories_list,
        "images": row["image_url"],
        "price": price_str,
        "average_rating": clean_float(row["average_rating"]),
        "rating_number": int(row["rating_number"]) if not pd.isna(row["rating_number"]) else 0,
        "score": clean_float(score),
        "cf_score": clean_float(cf_score),
        "cbf_score": clean_float(cbf_score)
    }

def log_user_event_to_db(conn, user_id: str, event_type: str, parent_asin: str = None, details: str = None, timestamp_ms: int = None):
    """Log click, search, cart, order, or review interactions into relational database tables.
    Handles foreign key validation and inserts placeholders if referenced records do not exist.
    """
    if not timestamp_ms:
        timestamp_ms = int(time.time() * 1000)
    
    dt = datetime.fromtimestamp(timestamp_ms / 1000.0)
    cursor = conn.cursor()
    try:
        # 1. Ensure User Exists in users table
        cursor.execute("SELECT 1 FROM users WHERE id = %s", (user_id,))
        if not cursor.fetchone():
            name = f"User_{user_id[:8]}"
            email = f"user_{user_id}@example.com"
            password_hash = hashlib.sha256(b"password").hexdigest()
            cursor.execute(
                "INSERT INTO users (id, name, email, password, created_at) VALUES (%s, %s, %s, %s, %s)",
                (user_id, name, email, password_hash, dt)
            )
            
        # 2. Ensure Product Exists in products table if parent_asin is provided
        p_id = parent_asin
        if p_id:
            cursor.execute("SELECT 1 FROM products WHERE parent_asin = %s", (p_id,))
            if not cursor.fetchone():
                # Create placeholder product
                cursor.execute(
                    "INSERT INTO products (parent_asin, title, price, average_rating, rating_number) VALUES (%s, %s, %s, %s, %s)",
                    (p_id, f"Product {p_id}", 19.99, 4.0, 1)
                )
        else:
            # If no product ID is provided (e.g., general search event), map to placeholder product
            p_id = "placeholder_item"
            cursor.execute("SELECT 1 FROM products WHERE parent_asin = 'placeholder_item'")
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO products (parent_asin, title, price, average_rating, rating_number) VALUES (%s, %s, %s, %s, %s)",
                    ("placeholder_item", "Placeholder Product", 0.0, 0.0, 0)
                )

        # 3. Insert event into specific tables depending on event type
        if event_type == 'review':
            # Save into reviews table
            rating = 4.0
            if details:
                try:
                    rating = float(details)
                except ValueError:
                    pass
            cursor.execute(
                """
                INSERT INTO reviews (user_id, product_id, rating, title, text, verified_purchase, timestamp)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, product_id) DO UPDATE SET
                    rating = EXCLUDED.rating,
                    timestamp = EXCLUDED.timestamp
                """,
                (user_id, p_id, rating, "Customer Review", details or "Written review details", True, dt)
            )
            
        elif event_type == 'cart':
            # Log interaction
            cursor.execute(
                "INSERT INTO interactions (user_id, product_id, interaction_type, timestamp) VALUES (%s, %s, %s, %s)",
                (user_id, p_id, 'cart', dt)
            )
            # Insert or update carts table
            cursor.execute(
                """
                INSERT INTO carts (user_id, product_id, amount, timestamp)
                VALUES (%s, %s, 1, %s)
                ON CONFLICT (user_id, product_id) DO UPDATE SET
                    amount = carts.amount + 1,
                    timestamp = EXCLUDED.timestamp
                """,
                (user_id, p_id, dt)
            )
            
        elif event_type in ('order', 'purchase'):
            # Log interaction
            cursor.execute(
                "INSERT INTO interactions (user_id, product_id, interaction_type, timestamp) VALUES (%s, %s, %s, %s)",
                (user_id, p_id, 'purchase', dt)
            )
            # Retrieve price from products
            cursor.execute("SELECT price FROM products WHERE parent_asin = %s", (p_id,))
            row = cursor.fetchone()
            price = row[0] if row else 19.99
            
            # Insert into orders table
            cursor.execute(
                """
                INSERT INTO orders (user_id, total_price, status, timestamp)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (user_id, price, 'completed', dt)
            )
            order_id = cursor.fetchone()[0]
            
            # Insert into order_items
            cursor.execute(
                "INSERT INTO order_items (order_id, product_id, amount, price_at_purchase) VALUES (%s, %s, 1, %s)",
                (order_id, p_id, price)
            )
            
            # Remove item from carts after purchase
            cursor.execute("DELETE FROM carts WHERE user_id = %s AND product_id = %s", (user_id, p_id))
            
        else:
            # Events click / view or search
            int_type = 'view'
            if event_type == 'search':
                int_type = 'search'
            cursor.execute(
                "INSERT INTO interactions (user_id, product_id, interaction_type, timestamp) VALUES (%s, %s, %s, %s)",
                (user_id, p_id, int_type, dt)
            )
            
        conn.commit()
        print(f"Logged event '{event_type}' to DB successfully.")
        return True
    except Exception as e:
        conn.rollback()
        print(f"Database transaction error logging event: {e}")
        return False
    finally:
        cursor.close()

def find_model_file(file_name):
    # 1. Try environment variable
    models_dir = os.getenv("MODELS_DIR")
    if models_dir and os.path.exists(os.path.join(models_dir, file_name)):
        return os.path.join(models_dir, file_name)
    
    # 2. Try relative to backend/ (e.g., inside docker /app/models or local D:\...\systems\backend\models)
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base_dir, "models", file_name)
    if os.path.exists(path):
        return path
        
    # 3. Try parent folder (e.g. D:\...\systems\models)
    parent_dir = os.path.dirname(base_dir)
    path = os.path.join(parent_dir, "models", file_name)
    if os.path.exists(path):
        return path
        
    # 4. Try absolute /app/models
    path = os.path.join("/app", "models", file_name)
    if os.path.exists(path):
        return path
        
    # Default fallback
    return os.path.join(parent_dir, "models", file_name)

stemmer = PorterStemmer()
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

def clean_text_custom(text):
    if not text:
        return ""
    text = str(text)
    text = html.unescape(text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    text = re.sub(r'[\u200b-\u200f\u2028-\u202f\ufeff]', '', text)
    text = re.sub(r'[\uff01-\uff5e]', lambda m: chr(ord(m.group()) - 0xfee0), text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def stemmed_tokenizer_custom(text):
    tokens = re.findall(r'\b\w+\b', text.lower())
    return [
        stemmer.stem(t)
        for t in tokens
        if t not in ENGLISH_STOP_WORDS and len(t) > 1
    ]

class RecommenderEngine:
    def __init__(self):
        self.products_df = pd.DataFrame()
        self.tfidf_matrix = None
        self.vectorizer = None
        self.product_id_to_index = {}
        
        # Paths for trained ALS Collaborative Filtering models & mappings
        self.model_npz_path = find_model_file("best_model.npz")
        self.user_map_path = find_model_file("user_mapping.csv")
        self.item_map_path = find_model_file("item_mapping.csv")
        
        self.using_trained_artifacts = False
        self.user_factors = None
        self.item_factors = None
        self.user_id_map = {}
        self.item_id_map = {}

    def get_db_connection(self):
        return psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )

    def load_products_and_initialize(self):
        """Load products from PostgreSQL and initialize TF-IDF representation."""
        print("Initializing Recommender Engine...")
        
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            # Ensure schema tables exist
            # Users Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            );
            """)
            
            # Products Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS products (
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
            
            # Interactions Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS interactions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id VARCHAR(50) NOT NULL REFERENCES products(parent_asin) ON DELETE CASCADE,
                interaction_type VARCHAR(50) NOT NULL,
                timestamp TIMESTAMP NOT NULL
            );
            """)
            
            # Reviews Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS reviews (
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
            
            # Carts Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS carts (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id VARCHAR(50) NOT NULL REFERENCES products(parent_asin) ON DELETE CASCADE,
                amount INTEGER NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                CONSTRAINT unique_user_product_cart UNIQUE (user_id, product_id)
            );
            """)
            
            # Orders Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                total_price FLOAT NOT NULL,
                status VARCHAR(50) NOT NULL,
                timestamp TIMESTAMP NOT NULL
            );
            """)
            
            # Order Items Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id VARCHAR(50) NOT NULL REFERENCES products(parent_asin) ON DELETE CASCADE,
                amount INTEGER NOT NULL,
                price_at_purchase FLOAT NOT NULL
            );
            """)
            
            # Indexes
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);")
            conn.commit()
            
            # Fetch products from database, including the main_category column
            query = "SELECT parent_asin, title, description, main_category, average_rating, rating_number, price, image_url, categories FROM products ORDER BY rating_number DESC LIMIT 50000"
            self.products_df = pd.read_sql(query, conn)
            
            # Clean string and numeric columns of NaN values to prevent JSON serialization crash
            self.products_df["title"] = self.products_df["title"].fillna("")
            self.products_df["description"] = self.products_df["description"].fillna("")
            self.products_df["main_category"] = self.products_df["main_category"].fillna("")
            self.products_df["image_url"] = self.products_df["image_url"].fillna("")
            self.products_df["categories"] = self.products_df["categories"].fillna("[]")
            self.products_df["rating_number"] = self.products_df["rating_number"].fillna(0).astype(int)
            self.products_df["price"] = self.products_df["price"].fillna(0.0)
            self.products_df["average_rating"] = self.products_df["average_rating"].fillna(0.0)
            
            cursor.close()
            conn.close()
            print(f"Loaded {len(self.products_df)} products from database.")
        except Exception as e:
            print(f"Error loading products or setting up tables: {e}")
            self.products_df = pd.DataFrame(columns=[
                "parent_asin", "title", "description", "main_category", "average_rating", "rating_number", "price", "image_url", "categories"
            ])
            return

        if self.products_df.empty:
            print("Database is empty. Please seed the database first.")
            return

        # Map parent_asin to index
        self.product_id_to_index = {asin: idx for idx, asin in enumerate(self.products_df["parent_asin"])}

        # Build Content-Based Index using vectorized operations
        print("Building Content-Based Filtering Index (TF-IDF)...")
        titles = self.products_df["title"].fillna("").astype(str)
        main_cats = self.products_df["main_category"].fillna("").astype(str)
        descs = self.products_df["description"].fillna("").astype(str)
        combined_series = (titles + " " + main_cats + " " + descs).tolist()

        self.vectorizer = TfidfVectorizer(
            stop_words='english',
            max_features=15000,
            min_df=2,
            sublinear_tf=True,
            norm='l2'
        )
        self.tfidf_matrix = self.vectorizer.fit_transform(combined_series)
        print("TF-IDF representation created successfully.")

        # Calculate popularity counts from the reviews table in the database (matching PopularityRecommender)
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT product_id, COUNT(*) as cnt FROM reviews GROUP BY product_id")
            pop_rows = cursor.fetchall()
            cursor.close()
            conn.close()
            pop_counts = {row[0]: row[1] for row in pop_rows}
        except Exception as e:
            print(f"Failed to fetch popularity counts from reviews table: {e}")
            pop_counts = {}

        # Map popularity counts to products_df (defaulting to 0)
        self.products_df["pop_count"] = self.products_df["parent_asin"].map(pop_counts).fillna(0).astype(float)
        
        # Normalize popularity counts using linear min-max scaling (matching PopularityRecommender)
        pop_values = self.products_df["pop_count"].values
        if len(pop_values) > 1 and pop_values.max() > pop_values.min():
            min_v, max_v = pop_values.min(), pop_values.max()
            self.products_df['norm_popularity'] = (pop_values - min_v) / (max_v - min_v + 1e-6)
        else:
            self.products_df['norm_popularity'] = np.ones_like(pop_values)

        # Check for trained artifacts
        self.check_trained_artifacts()

    def check_trained_artifacts(self):
        if (os.path.exists(self.model_npz_path) and 
            os.path.exists(self.user_map_path) and 
            os.path.exists(self.item_map_path)):
            try:
                print("Trained ALS Collaborative Filtering models found! Loading...")
                archive = np.load(self.model_npz_path)
                self.user_factors = archive["user_factors"]
                self.item_factors = archive["item_factors"]
                
                # Load CSV mapping files directly instead of json artifacts
                user_df = pd.read_csv(self.user_map_path)
                self.user_id_map = dict(zip(user_df["user_id"].astype(str), user_df["user_idx"].astype(int)))
                
                item_df = pd.read_csv(self.item_map_path)
                self.item_id_map = dict(zip(item_df["parent_asin"].astype(str), item_df["item_idx"].astype(int)))
                self.idx_to_item_map = {idx: asin for asin, idx in self.item_id_map.items()}
                
                self.using_trained_artifacts = True
                print(f"ALS CF factors loaded successfully: {len(self.user_id_map)} users, {len(self.item_id_map)} items.")
            except Exception as e:
                print(f"Failed to load ALS models: {e}")
                self.using_trained_artifacts = False
        else:
            print("ALS Collaborative Filtering models or mappings not found.")
            self.using_trained_artifacts = False

    def log_user_event(self, user_id: str, event_type: str, parent_asin: str = None, details: str = None):
        """Log event directly to DB using background task."""
        try:
            conn = self.get_db_connection()
            success = log_user_event_to_db(conn, user_id, event_type, parent_asin, details)
            conn.close()
            return success
        except Exception as e:
            print(f"Failed logging user event: {e}")
            return False

    def save_user_onboarding(self, user_id: str, categories: list):
        """No-op legacy onboarding save (onboarding is disabled)."""
        return True

    def get_user_profile(self, user_id: str):
        """No-op legacy onboarding profile retriever (onboarding is disabled)."""
        return []

    def _get_user_events(self, user_id: str):
        user_events = []
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT product_id, 
                       CASE 
                           WHEN interaction_type = 'view' THEN 'click'
                           WHEN interaction_type = 'purchase' THEN 'order'
                           ELSE interaction_type 
                       END as event_type,
                       NULL as details,
                       timestamp 
                FROM interactions 
                WHERE user_id = %s
                UNION ALL
                SELECT product_id, 
                       'review' as event_type, 
                       rating::text as details, 
                       timestamp 
                FROM reviews 
                WHERE user_id = %s
                ORDER BY timestamp DESC
                """,
                (user_id, user_id)
            )
            user_events = cursor.fetchall()
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"Failed to fetch interaction events: {e}")
        return user_events

    def _build_user_profile_vector(self, user_events):
        recent_events = user_events[:10]
        
        num_features = self.tfidf_matrix.shape[1]
        user_profile_vec = np.zeros(num_features)
        
        event_weights = {
            "click": 1.0,
            "search": 1.5,
            "cart": 3.0,
            "order": 5.0,
            "review": 4.0
        }

        total_weight = 0.0

        for asin, event_type, details, _ in recent_events:
            weight = event_weights.get(event_type, 1.0)
            if asin and asin in self.product_id_to_index:
                product_idx = self.product_id_to_index[asin]
                
                if event_type == "review" and details:
                    try:
                        weight = float(details) * 1.5
                    except:
                        pass
                
                product_vec = self.tfidf_matrix[product_idx].toarray().flatten()
                user_profile_vec += product_vec * weight
                total_weight += abs(weight)

        if total_weight > 0:
            user_profile_vec = user_profile_vec / total_weight

        norm = np.linalg.norm(user_profile_vec)
        if norm > 0:
            user_profile_vec = user_profile_vec / norm
        return user_profile_vec

    def _get_cbf_candidates(self, user_profile_vec, k_candidates=100):
        if self.products_df.empty or self.tfidf_matrix is None:
            return []
            
        similarities = cosine_similarity(user_profile_vec.reshape(1, -1), self.tfidf_matrix).flatten()
            
        top_indices = np.argsort(similarities)[::-1]
        
        candidates = []
        for idx in top_indices:
            row = self.products_df.iloc[idx]
            asin = row["parent_asin"]
            if asin == "placeholder_item":
                continue
            candidates.append({
                "item_id": asin,
                "score": float(similarities[idx]),
                "row": row
            })
            if len(candidates) >= k_candidates:
                break
        return candidates

    def _get_als_candidates(self, user_id: str, k_candidates=100):
        if not self.using_trained_artifacts or user_id not in self.user_id_map:
            return []
            
        # Fallback to local memory calculations
        user_idx = self.user_id_map[user_id]
        user_vector = self.user_factors[user_idx]
        scores = self.item_factors.dot(user_vector)
        
        sorted_indices = np.argsort(scores)[::-1]
        candidates = []
        for idx in sorted_indices:
            item_asin = self.idx_to_item_map.get(idx)
            if item_asin is None or item_asin == "placeholder_item":
                continue
                
            db_idx = self.product_id_to_index.get(item_asin)
            if db_idx is not None:
                row = self.products_df.iloc[db_idx]
                candidates.append({
                    "item_id": item_asin,
                    "score": float(scores[idx]),
                    "row": row
                })
                if len(candidates) >= k_candidates:
                    break
        return candidates

    def recommend_for_user(self, user_id: str, k: int = 4):
        """Get switching hybrid recommendations for a user.
        - Cold start:
          - No history -> popular items (by review count)
          - Has history -> pure TF-IDF Content-Based Filtering
        - Warm user:
          - Candidate Generation: ALS CF candidates + TF-IDF CBF candidates (from last 10 interactions)
          - Re-ranking: Weighted combination of cf_score (0.6) and cbf_score (0.4)
        """
        if self.products_df.empty:
            return []

        user_events = self._get_user_events(user_id)
        reviewed_asins = {row[0] for row in user_events if row[1] == 'review' and row[0]}

        # Check if user is Warm (in trained ALS CF model)
        is_warm = self.using_trained_artifacts and user_id in self.user_id_map

        if is_warm:
            print(f"[Hybrid Recommender] Warm user flow for: {user_id}")
            # Stage 1: Candidate Generation
            als_candidates = self._get_als_candidates(user_id, k_candidates=100)
            
            user_profile_vec = self._build_user_profile_vector(user_events)
            cbf_candidates = self._get_cbf_candidates(user_profile_vec, k_candidates=100)
            
            # Combine candidates into candidate pool
            candidate_pool = {}
            for c in als_candidates:
                asin = c["item_id"]
                candidate_pool[asin] = {
                    "row": c["row"],
                    "raw_als_score": c["score"],
                    "cbf_score": None
                }
                
            for c in cbf_candidates:
                asin = c["item_id"]
                if asin not in candidate_pool:
                    candidate_pool[asin] = {
                        "row": c["row"],
                        "raw_als_score": None,
                        "cbf_score": c["score"]
                    }
                else:
                    candidate_pool[asin]["cbf_score"] = c["score"]
                    
            # Compute missing scores in the pool
            user_idx = self.user_id_map[user_id]
            user_vector = self.user_factors[user_idx]
            
            for asin, val in candidate_pool.items():
                if val["cbf_score"] is None:
                    product_idx = self.product_id_to_index.get(asin)
                    if product_idx is not None:
                        product_vec = self.tfidf_matrix[product_idx].toarray().flatten()
                        cbf_score = float(cosine_similarity(user_profile_vec.reshape(1, -1), product_vec.reshape(1, -1)).flatten()[0])
                        val["cbf_score"] = cbf_score
                    else:
                        val["cbf_score"] = 0.0
                        
                if val["raw_als_score"] is None:
                    if asin in self.item_id_map:
                        mapped_idx = self.item_id_map[asin]
                        val["raw_als_score"] = float(self.item_factors[mapped_idx].dot(user_vector))
                    else:
                        val["raw_als_score"] = 0.0
                        
            # Normalize raw ALS scores in candidate pool
            als_scores = [v["raw_als_score"] for v in candidate_pool.values()]
            if als_scores:
                min_als = min(als_scores)
                max_als = max(als_scores)
                range_als = max_als - min_als
                if range_als < 1e-6:
                    range_als = 1.0
            else:
                min_als = 0.0
                range_als = 1.0
                
            # Stage 2: Re-ranking (excluding seen items)
            ranked_recs = []
            for asin, val in candidate_pool.items():
                if asin == "placeholder_item" or asin in reviewed_asins:
                    continue
                    
                cf_score = (val["raw_als_score"] - min_als) / range_als
                cbf_score = val["cbf_score"]
                score = 0.6 * cf_score + 0.4 * cbf_score
                
                row = val["row"]
                ranked_recs.append(format_product_dict(
                    row, score=score, cf_score=cf_score, cbf_score=cbf_score
                ))
                
            ranked_recs = sorted(ranked_recs, key=lambda x: x["score"], reverse=True)
            return ranked_recs[:k]

        else:
            # Cold Start user flow
            if not user_events:
                bestsellers = self.products_df[self.products_df["parent_asin"] != "placeholder_item"].sort_values(
                    by="norm_popularity", ascending=False
                ).head(k)
                
                return [format_product_dict(
                    row, score=row["norm_popularity"], cf_score=row["norm_popularity"], cbf_score=row["norm_popularity"]
                ) for _, row in bestsellers.iterrows()]
            
            else:
                print(f"[Hybrid Recommender] Cold-start with history: CBF candidate flow for {user_id}")
                user_profile_vec = self._build_user_profile_vector(user_events)
                cbf_candidates = self._get_cbf_candidates(user_profile_vec, k_candidates=100)
                
                recs = []
                for c in cbf_candidates:
                    asin = c["item_id"]
                    if asin == "placeholder_item" or asin in reviewed_asins:
                        continue
                        
                    row = c["row"]
                    cbf_score = c["score"]
                    # For pure CBF, score is cbf_score, cf_score is 0.0 or baseline
                    recs.append(format_product_dict(
                        row, score=cbf_score, cf_score=0.0, cbf_score=cbf_score
                    ))
                    if len(recs) >= k:
                        break
                return recs

    def get_similar_items(self, item_id: str, k: int = 3, source: str = "cbf"):
        if self.products_df.empty:
            return []

        target_idx = self.product_id_to_index.get(item_id)
        if target_idx is None:
            fallback_items = self.products_df.sort_values(by="norm_popularity", ascending=False).head(k)
            return [format_product_dict(
                row, score=row["norm_popularity"]
            ) for _, row in fallback_items.iterrows()]

        if source == "cbf":
            similarities = cosine_similarity(self.tfidf_matrix[target_idx], self.tfidf_matrix).flatten()
            similar_indices = np.argsort(similarities)[::-1]
            similar_indices = [idx for idx in similar_indices if idx != target_idx][:k]
            
            results = []
            for idx in similar_indices:
                row = self.products_df.iloc[idx]
                results.append(format_product_dict(
                    row, score=similarities[idx]
                ))
            return results
        else:
            # Fallback to local ALS factors calculations
            if self.using_trained_artifacts and item_id in self.item_id_map:
                mapped_id = self.item_id_map[item_id]
                target_vector = self.item_factors[mapped_id].reshape(1, -1)
                similarities = cosine_similarity(target_vector, self.item_factors).flatten()
                
                top_indices = np.argsort(similarities)[::-1]
                results = []
                for idx in top_indices:
                    item_asin = self.idx_to_item_map.get(idx)
                    if item_asin is None or item_asin == item_id or item_asin == "placeholder_item":
                        continue
                    
                    db_idx = self.product_id_to_index.get(item_asin)
                    if db_idx is not None:
                        row = self.products_df.iloc[db_idx]
                        results.append(format_product_dict(
                            row, score=similarities[idx]
                        ))
                        if len(results) >= k:
                            break
                return results
            else:
                target_row = self.products_df.iloc[target_idx]
                target_cats = set(json.loads(target_row["categories"]) if isinstance(target_row["categories"], str) else (target_row["categories"] or []))
                
                same_cat_rows = []
                for idx, row in self.products_df.iterrows():
                    if idx == target_idx:
                        continue
                    row_cats = json.loads(row["categories"]) if isinstance(row["categories"], str) else (row["categories"] or [])
                    intersection = target_cats.intersection(row_cats)
                    if intersection and "Books" not in intersection:
                        score = len(intersection) / max(len(target_cats), 1)
                        score = score * 0.7 + np.random.uniform(0.1, 0.3)
                        same_cat_rows.append((idx, score))
                        
                same_cat_rows = sorted(same_cat_rows, key=lambda x: x[1], reverse=True)[:k]
                
                results = []
                for idx, score in same_cat_rows:
                    row = self.products_df.iloc[idx]
                    results.append(format_product_dict(
                        row, score=score
                    ))
                return results

    def search_by_text(self, query: str, k: int = 12):
        if self.products_df.empty or self.vectorizer is None or self.tfidf_matrix is None:
            return []

        # Fallback to local TF-IDF search
        query_vec = self.vectorizer.transform([query])
        similarities = cosine_similarity(query_vec, self.tfidf_matrix).flatten()
        top_indices = np.argsort(similarities)[::-1][:k]
        
        results = []
        for idx in top_indices:
            score = float(similarities[idx])
            if score == 0.0:
                continue
            row = self.products_df.iloc[idx]
            if row["parent_asin"] == "placeholder_item":
                continue
            results.append(format_product_dict(
                row, score=score
            ))
            
        if not results:
            popular_items = self.products_df[self.products_df["parent_asin"] != "placeholder_item"].sort_values(by="norm_popularity", ascending=False).head(k)
            results = [format_product_dict(
                row, score=row["norm_popularity"]
            ) for _, row in popular_items.iterrows()]
            
        return results

    def _recommend_trained_cf(self, user_id: str, k: int):
        """Deprecated: recommend_for_user now handles all flows natively."""
        return self.recommend_for_user(user_id, k)
