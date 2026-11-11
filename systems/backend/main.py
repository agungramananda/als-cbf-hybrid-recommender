import os
import json
import time
import uuid
import hashlib

import uvicorn
import psycopg2
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from recommender import RecommenderEngine, clean_float

app = FastAPI(title="Two-Stage Hybrid Products Recommender API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = RecommenderEngine()

# In-memory Session Database (simplifying and replacing Redis)
sessions_db = {}

@app.on_event("startup")
def startup_event():
    # Load database records and build TF-IDF indexes
    engine.load_products_and_initialize()

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/stats")
def get_stats():
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM products")
        n_items = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM reviews")
        n_ratings = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT user_id) FROM reviews")
        n_users = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Failed to query database statistics: {e}")
        n_items = len(engine.products_df)
        n_ratings = 0
        n_users = 0

    return {
        "status": "ok",
        "n_items": n_items,
        "n_ratings": n_ratings,
        "n_users": n_users,
        "using_trained_artifacts": engine.using_trained_artifacts,
        "using_rabbitmq": using_rabbitmq,
        "using_redis": (redis_client is not None)
    }

class EventPayload(BaseModel):
    event_type: str
    parent_asin: Optional[str] = None
    details: Optional[str] = None

@app.post("/user/{user_id}/event")
def post_user_event(user_id: str, payload: EventPayload, background_tasks: BackgroundTasks):
    """Log click, search, cart, order, or review interactions directly into PostgreSQL using background tasks."""
    background_tasks.add_task(
        engine.log_user_event,
        user_id=user_id,
        event_type=payload.event_type,
        parent_asin=payload.parent_asin,
        details=payload.details
    )
    return {"status": "ok", "mode": "postgresql", "user_id": user_id, "event_type": payload.event_type}

@app.get("/recommend/{user_id}")
def get_recommendations(user_id: str, k: int = Query(default=4, ge=1)):
    try:
        recs = engine.recommend_for_user(user_id=user_id, k=k)
        return {"user_id": user_id, "items": recs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation failed: {str(e)}")

@app.get("/similar/{product_id}")
def get_similar_items(product_id: str, k: int = Query(default=3, ge=1), source: str = Query(default="cbf")):
    if source not in ["cbf", "cf"]:
        raise HTTPException(status_code=400, detail="Invalid source. Must be 'cbf' or 'cf'")
    try:
        items = engine.get_similar_items(item_id=product_id, k=k, source=source)
        return {"product_id": product_id, "source": source, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Similarity lookup failed: {str(e)}")

class SearchQuery(BaseModel):
    query: str
    k: int = 12

@app.post("/similar_by_text")
def search_similar_by_text(payload: SearchQuery):
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty")
    try:
        items = engine.search_by_text(query=payload.query, k=payload.k)
        return {"query": payload.query, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text similarity search failed: {str(e)}")

# =====================================================================
# USER SESSION & AUTHENTICATION ENDPOINTS (REDIS-BACKED)
# =====================================================================

class RegisterPayload(BaseModel):
    id: str
    name: str
    email: str
    password: str

@app.post("/register")
def post_register(payload: RegisterPayload):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        # Verify if user already exists
        cursor.execute("SELECT 1 FROM users WHERE id = %s OR email = %s", (payload.id, payload.email))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="User ID or Email already registered")
            
        password_hash = hashlib.sha256(payload.password.encode('utf-8')).hexdigest()
        
        cursor.execute(
            "INSERT INTO users (id, name, email, password, created_at) VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)",
            (payload.id, payload.name, payload.email, password_hash)
        )
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            "status": "ok",
            "user": {
                "id": payload.id,
                "name": payload.name,
                "email": payload.email,
                "username": payload.email.split('@')[0]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

class LoginPayload(BaseModel):
    email: str
    password: str

@app.post("/login")
def post_login(payload: LoginPayload):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, name, email, password FROM users WHERE email = %s", (payload.email,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        user_id, name, email, db_password_hash = row
        
        # Verify password hash
        password_hash = hashlib.sha256(payload.password.encode('utf-8')).hexdigest()
        if password_hash != db_password_hash:
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        # Generate session token (UUID)
        token = str(uuid.uuid4())
        
        # Save session in memory
        session_data = {
            "id": user_id,
            "name": name,
            "email": email
        }
        sessions_db[token] = session_data
            
        return {
            "status": "ok",
            "token": token,
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "username": email.split('@')[0]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

class LogoutPayload(BaseModel):
    token: str

@app.post("/logout")
def post_logout(payload: LogoutPayload):
    sessions_db.pop(payload.token, None)
    return {"status": "ok"}

@app.get("/session")
def get_session(token: str = Query(...)):
    session_data = sessions_db.get(token)
    if not session_data:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    
    return {
        "status": "ok",
        "user": {
            "id": session_data["id"],
            "name": session_data["name"],
            "email": session_data["email"],
            "username": session_data["email"].split('@')[0]
        }
    }
# =====================================================================
# USER DIRECTORY ENDPOINT
# =====================================================================

@app.get("/users")
def get_users(limit: int = Query(30, ge=1)):
    """Retrieve actual users from the seeded database who have interaction/review histories."""
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        # Fetch users who actually have reviews so they have recommendations.
        cursor.execute(
            """
            SELECT DISTINCT u.id, u.name, u.email 
            FROM users u
            INNER JOIN reviews r ON u.id = r.user_id
            WHERE u.id NOT IN ('1234567890', '9876543210', '5554443332')
            LIMIT %s
            """,
            (limit,)
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        users = []
        # Include default simulation users first
        users.append({"id": "1234567890", "name": "Agung Pradana (Default)", "email": "agung@example.com"})
        users.append({"id": "9876543210", "name": "Elizabeth Smith (Music)", "email": "elizabeth@example.com"})
        users.append({"id": "5554443332", "name": "Guest User (New Profile)", "email": "guest@example.com"})
        
        for row in rows:
            users.append({
                "id": row[0],
                "name": f"{row[1]} ({row[0][:8]}...)",
                "email": row[2]
            })
        return {"users": users}
    except Exception as e:
        return {
            "users": [
                {"id": "1234567890", "name": "Agung Pradana (Default)", "email": "agung@example.com"},
                {"id": "9876543210", "name": "Elizabeth Smith (Music)", "email": "elizabeth@example.com"},
                {"id": "5554443332", "name": "Guest User (New Profile)", "email": "guest@example.com"}
            ],
            "error": str(e)
        }

# =====================================================================
# PRODUCT CATALOG & DETAIL ENDPOINTS
# =====================================================================

@app.get("/products")
def get_products(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1),
    category: Optional[str] = None,
    search: Optional[str] = None
):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        # Build query dynamically
        query = "SELECT parent_asin, title, description, main_category, categories, average_rating, rating_number, price, image_url FROM products WHERE parent_asin != 'placeholder_item'"
        params = []
        
        if category and category != 'All':
            query += " AND main_category = %s"
            params.append(category)
            
        if search:
            query += " AND (title ILIKE %s OR main_category ILIKE %s OR description ILIKE %s)"
            params.append(f"%{search}%")
            params.append(f"%{search}%")
            params.append(f"%{search}%")
            
        # Count total matches
        count_query = query.replace("SELECT parent_asin, title, description, main_category, categories, average_rating, rating_number, price, image_url", "SELECT COUNT(*)")
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]
        
        # Paginate results
        query += " ORDER BY average_rating DESC, rating_number DESC LIMIT %s OFFSET %s"
        params.extend([limit, (page - 1) * limit])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        items = []
        for row in rows:
            items.append({
                "parent_asin": row[0],
                "title": row[1],
                "description": row[2],
                "main_category": row[3],
                "categories": json.loads(row[4]) if row[4] else [],
                "average_rating": clean_float(row[5]),
                "rating_number": int(row[6]) if row[6] else 0,
                "price": clean_float(row[7]),
                "image_url": row[8] or "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600"
            })
            
        return {"items": items, "total": total, "page": page, "limit": limit}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/products/{product_id}")
def get_product_detail(product_id: str):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT parent_asin, title, description, main_category, categories, average_rating, rating_number, price, image_url FROM products WHERE parent_asin = %s",
            (product_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Product not found")
            
        return {
            "parent_asin": row[0],
            "title": row[1],
            "description": row[2],
            "main_category": row[3],
            "categories": json.loads(row[4]) if row[4] else [],
            "average_rating": clean_float(row[5]),
            "rating_number": int(row[6]) if row[6] else 0,
            "price": clean_float(row[7]),
            "image_url": row[8] or "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =====================================================================
# CART OPERATIONS
# =====================================================================

@app.get("/user/{user_id}/cart")
def get_user_cart(user_id: str):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT c.product_id, c.amount, p.title, p.price, p.image_url, p.main_category
            FROM carts c
            JOIN products p ON c.product_id = p.parent_asin
            WHERE c.user_id = %s
            ORDER BY c.timestamp DESC
            """,
            (user_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        cart = []
        for row in rows:
            cart.append({
                "id": row[0],
                "quantity": row[1],
                "name": row[2],
                "price": clean_float(row[3]),
                "image": row[4] or "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600",
                "option": f"Category: {row[5]}" if row[5] else "Standard"
            })
        return {"cart": cart}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AddToCartPayload(BaseModel):
    product_id: str
    quantity: int = 1

@app.post("/user/{user_id}/cart")
def add_to_cart(user_id: str, payload: AddToCartPayload):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        # Ensure product exists
        cursor.execute("SELECT 1 FROM products WHERE parent_asin = %s", (payload.product_id,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO products (parent_asin, title, price, average_rating, rating_number) VALUES (%s, %s, %s, %s, %s)",
                (payload.product_id, f"Product {payload.product_id}", 19.99, 4.0, 1)
            )
            
        cursor.execute(
            """
            INSERT INTO carts (user_id, product_id, amount, timestamp)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, product_id) DO UPDATE SET
                amount = carts.amount + EXCLUDED.amount,
                timestamp = CURRENT_TIMESTAMP
            """,
            (user_id, payload.product_id, payload.quantity)
        )
        
        # Log to interactions table for recommendation tracking
        cursor.execute(
            "INSERT INTO interactions (user_id, product_id, interaction_type, timestamp) VALUES (%s, %s, %s, CURRENT_TIMESTAMP)",
            (user_id, payload.product_id, 'cart')
        )
        
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateCartPayload(BaseModel):
    quantity: int

@app.put("/user/{user_id}/cart/{product_id}")
def update_cart_quantity(user_id: str, product_id: str, payload: UpdateCartPayload):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        if payload.quantity <= 0:
            cursor.execute("DELETE FROM carts WHERE user_id = %s AND product_id = %s", (user_id, product_id))
        else:
            cursor.execute(
                "UPDATE carts SET amount = %s, timestamp = CURRENT_TIMESTAMP WHERE user_id = %s AND product_id = %s",
                (payload.quantity, user_id, product_id)
            )
            
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/{user_id}/cart/{product_id}")
def delete_cart_item(user_id: str, product_id: str):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM carts WHERE user_id = %s AND product_id = %s", (user_id, product_id))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =====================================================================
# ORDER & CHECKOUT OPERATIONS
# =====================================================================

@app.get("/user/{user_id}/orders")
def get_user_orders(user_id: str):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            """
            SELECT id, total_price, status, timestamp
            FROM orders
            WHERE user_id = %s
            ORDER BY timestamp DESC
            """,
            (user_id,)
        )
        order_rows = cursor.fetchall()
        
        orders = []
        for o_row in order_rows:
            order_id, total_price, status, timestamp = o_row
            
            cursor.execute(
                """
                SELECT oi.product_id, oi.amount, oi.price_at_purchase, p.title, p.image_url
                FROM order_items oi
                JOIN products p ON oi.product_id = p.parent_asin
                WHERE oi.order_id = %s
                """,
                (order_id,)
            )
            item_rows = cursor.fetchall()
            
            items = []
            product_name = ""
            image_url = ""
            for i_row in item_rows:
                items.append({
                    "product_id": i_row[0],
                    "quantity": i_row[1],
                    "price": clean_float(i_row[2]),
                    "title": i_row[3],
                    "image": i_row[4]
                })
                if not product_name:
                    product_name = i_row[3]
                    image_url = i_row[4]
            
            if len(item_rows) > 1:
                product_name += f" and {len(item_rows) - 1} other item(s)"
                
            orders.append({
                "id": f"LX-{order_id}",
                "productName": product_name,
                "date": timestamp.strftime("%b %d, %Y"),
                "price": clean_float(total_price),
                "image": image_url or "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600",
                "status": status,
                "items": items
            })
            
        cursor.close()
        conn.close()
        return {"orders": orders}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/{user_id}/checkout")
def checkout_cart(user_id: str):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            """
            SELECT c.product_id, c.amount, p.price
            FROM carts c
            JOIN products p ON c.product_id = p.parent_asin
            WHERE c.user_id = %s
            """,
            (user_id,)
        )
        cart_rows = cursor.fetchall()
        
        if not cart_rows:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="Cart is empty")
            
        subtotal = sum(row[1] * (row[2] or 19.99) for row in cart_rows)
        taxes = subtotal * 0.07
        total_price = subtotal + taxes
        
        cursor.execute(
            """
            INSERT INTO orders (user_id, total_price, status, timestamp)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING id
            """,
            (user_id, total_price, 'Processing')
        )
        order_id = cursor.fetchone()[0]
        
        for row in cart_rows:
            product_id, amount, price = row
            price_val = price or 19.99
            
            cursor.execute(
                "INSERT INTO order_items (order_id, product_id, amount, price_at_purchase) VALUES (%s, %s, %s, %s)",
                (order_id, product_id, amount, price_val)
            )
            
            cursor.execute(
                "INSERT INTO interactions (user_id, product_id, interaction_type, timestamp) VALUES (%s, %s, %s, CURRENT_TIMESTAMP)",
                (user_id, product_id, 'purchase')
            )
            
        cursor.execute("DELETE FROM carts WHERE user_id = %s", (user_id,))
        
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "ok", "order_id": f"LX-{order_id}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =====================================================================
# REVIEWS OPERATIONS
# =====================================================================

@app.get("/products/{product_id}/reviews")
def get_product_reviews(product_id: str):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT r.id, r.user_id, u.name, r.rating, r.title, r.text, r.timestamp
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = %s
            ORDER BY r.timestamp DESC
            """,
            (product_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        reviews = []
        for row in rows:
            author_name = row[2] or f"User_{row[1][:8]}"
            reviews.append({
                "id": f"r-{row[0]}",
                "author": author_name,
                "initial": author_name[0].upper() if author_name else "U",
                "rating": clean_float(row[3]),
                "title": row[4] or "Customer Review",
                "date": row[6].strftime("%B %d, %Y"),
                "text": row[5] or ""
            })
        return {"reviews": reviews}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/user/{user_id}/reviews")
def get_user_reviews(user_id: str):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT r.id, r.product_id, p.title, p.categories, r.rating, r.title, r.text, r.timestamp, p.image_url
            FROM reviews r
            JOIN products p ON r.product_id = p.parent_asin
            WHERE r.user_id = %s
            ORDER BY r.timestamp DESC
            """,
            (user_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        reviews = []
        for row in rows:
            cats = json.loads(row[3]) if row[3] else []
            cat_name = cats[0].upper() if cats else "PRODUCTS"
            reviews.append({
                "id": f"ur-{row[0]}",
                "productId": row[1],
                "productName": row[2],
                "category": cat_name,
                "rating": clean_float(row[4]),
                "title": row[5] or "Customer Review",
                "date": row[7].strftime("%B %d, %Y"),
                "text": row[6] or "",
                "image": row[8] or "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600"
            })
        return {"reviews": reviews}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ReviewPayload(BaseModel):
    user_id: str
    rating: float
    title: str
    text: str

@app.post("/products/{product_id}/reviews")
def post_product_review(product_id: str, payload: ReviewPayload):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        # Ensure user exists
        cursor.execute("SELECT 1 FROM users WHERE id = %s", (payload.user_id,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO users (id, name, email, password) VALUES (%s, %s, %s, %s)",
                (payload.user_id, f"User_{payload.user_id[:8]}", f"user_{payload.user_id}@example.com", "password")
            )
            
        # Ensure product exists
        cursor.execute("SELECT 1 FROM products WHERE parent_asin = %s", (product_id,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO products (parent_asin, title, price, average_rating, rating_number) VALUES (%s, %s, %s, %s, %s)",
                (product_id, f"Product {product_id}", 19.99, 4.0, 1)
            )

        cursor.execute(
            """
            INSERT INTO reviews (user_id, product_id, rating, title, text, verified_purchase, timestamp)
            VALUES (%s, %s, %s, %s, %s, TRUE, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, product_id) DO UPDATE SET
                rating = EXCLUDED.rating,
                title = EXCLUDED.title,
                text = EXCLUDED.text,
                timestamp = CURRENT_TIMESTAMP
            """,
            (payload.user_id, product_id, payload.rating, payload.title, payload.text)
        )
        
        # Update product rating details
        cursor.execute(
            """
            UPDATE products
            SET average_rating = (SELECT AVG(rating) FROM reviews WHERE product_id = %s),
                rating_number = (SELECT COUNT(*) FROM reviews WHERE product_id = %s)
            WHERE parent_asin = %s
            """,
            (product_id, product_id, product_id)
        )
        
        # Log to interactions table for recommendation tracking
        cursor.execute(
            "INSERT INTO interactions (user_id, product_id, interaction_type, timestamp) VALUES (%s, %s, %s, CURRENT_TIMESTAMP)",
            (payload.user_id, product_id, 'review')
        )
        
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/{user_id}/reviews/{review_id}")
def delete_user_review(user_id: str, review_id: str):
    try:
        conn = engine.get_db_connection()
        cursor = conn.cursor()
        
        # Parse numeric review id (strip leading prefix if present)
        numeric_id = review_id
        if isinstance(review_id, str):
            if review_id.startswith("ur-"):
                numeric_id = review_id.replace("ur-", "")
            elif review_id.startswith("r-"):
                numeric_id = review_id.replace("r-", "")
                
        numeric_id = int(numeric_id)
        
        cursor.execute("SELECT product_id FROM reviews WHERE id = %s AND user_id = %s", (numeric_id, user_id))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Review not found")
        product_id = row[0]
        
        cursor.execute("DELETE FROM reviews WHERE id = %s AND user_id = %s", (numeric_id, user_id))
        
        # Update product rating details
        cursor.execute(
            """
            UPDATE products
            SET average_rating = COALESCE((SELECT AVG(rating) FROM reviews WHERE product_id = %s), 0.0),
                rating_number = COALESCE((SELECT COUNT(*) FROM reviews WHERE product_id = %s), 0)
            WHERE parent_asin = %s
            """,
            (product_id, product_id, product_id)
        )
        
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
