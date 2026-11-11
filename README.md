# Product Recommendation System

Thesis project for a product recommendation web application. The system
provides an online shopping interface with personalized recommendations,
similar-product retrieval, and text-based product search.

## Features

- Hybrid recommendations using:
  - Collaborative filtering with trained ALS factors
  - Content-based filtering using product and user text representations
- Cold-start fallback recommendations
- Similar-product lookup
- TF-IDF text search
- User registration and login
- Product catalog, cart, checkout, orders, and reviews
- User-event logging for recommendation signals

## Architecture

```text
React + Vite frontend
          |
          | HTTP/JSON
          v
FastAPI backend ---- PostgreSQL
          |
          +---- ALS/model artifacts
          +---- TF-IDF and embedding indexes
          +---- User interaction events
```

## Project structure

```text
.
├── als_collaborative.py       # ALS experimentation/training script
├── tf-idf-cbf.ipynb           # TF-IDF content-based filtering notebook
├── datasets/                  # Product metadata and review data
├── models/                    # Trained model outputs and ID mappings
└── systems/
    ├── docker-compose.yml     # Local multi-container deployment
    ├── backend/
    │   ├── main.py            # FastAPI routes
    │   ├── recommender.py     # Recommendation engine
    │   ├── seed_db.py         # Database schema and data seeding
    │   ├── import_artifacts.py
    │   └── worker.py          # Background event worker
    └── frontend/
        └── src/App.jsx        # React application
```

## Requirements

- Docker Desktop with Docker Compose
- Alternatively:
  - Python 3.11+
  - Node.js 20+
  - PostgreSQL 15+

## Run with Docker Compose

Open a terminal in the `systems` directory:

```powershell
cd systems
docker compose up --build
```

Open the application at:

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:8000>
- API health check: <http://localhost:8000/health>

The PostgreSQL database is available at `localhost:5432`.

### Seed the database

Run the seeder after PostgreSQL is healthy:

```powershell
docker compose --profile tools run --rm db-seeder
```

The seeder expects these files:

```text
datasets/meta.parquet
datasets/reviews.csv
```

## Run services locally

### Backend

```powershell
cd systems/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

The API runs on <http://localhost:8000>.

Backend configuration can be supplied through environment variables such as
`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. Keep local
secrets in a `.env` file and do not commit that file.

### Frontend

```powershell
cd systems/frontend
npm install
npm run dev
```

The frontend runs on <http://localhost:5173>.

Useful frontend commands:

```powershell
npm run lint
npm run build
npm run preview
```

## API overview

### Recommendations and search

```text
GET  /recommend/{user_id}?k=30
GET  /similar/{product_id}?k=3&source=cbf
POST /similar_by_text
```

### Authentication

```text
POST /register
POST /login
POST /logout
GET  /session
```

### Products and commerce

```text
GET    /products
GET    /products/{product_id}
GET    /user/{user_id}/cart
POST   /user/{user_id}/cart
PUT    /user/{user_id}/cart/{product_id}
DELETE /user/{user_id}/cart/{product_id}
POST   /user/{user_id}/checkout
```

The complete route implementation is in
[`systems/backend/main.py`](systems/backend/main.py).

## Recommendation algorithms

The recommendation engine uses a hybrid approach. Collaborative filtering
learns preference patterns from user-item interactions, while content-based
filtering recommends products whose descriptions are similar to products the
user interacted with.

The serving implementation is in
[`systems/backend/recommender.py`](systems/backend/recommender.py). The model
training experiments are in
[`als_collaborative.py`](als_collaborative.py) and
[`tf-idf-cbf.ipynb`](tf-idf-cbf.ipynb).

### 1. ALS collaborative filtering

Alternating Least Squares (ALS) represents every user and item as a vector in
the same latent space:

```text
user u  ->  p_u in R^f
item i  ->  q_i in R^f
predicted preference(u, i) = p_u · q_i
```

Here, `f` is the number of latent factors. A high dot product means that the
user and item have compatible latent characteristics, even when the item has
not been explicitly described with the same words as the user's previous
items.

The training process uses the review/interactions matrix `R`, where rows are
users and columns are products. The matrix is sparse because each user
interacts with only a small fraction of the catalog. For implicit-feedback
training, an interaction is converted into:

```text
preference p_ui = 1 if an interaction exists, otherwise 0
confidence c_ui = 1 + alpha * r_ui
```

The ALS objective minimizes the weighted reconstruction error with L2
regularization:

```text
min(P,Q) Σ(u,i) c_ui (p_ui - p_u · q_i)^2
          + λ (Σu ||p_u||² + Σi ||q_i||²)
```

ALS alternates between two least-squares updates:

1. Hold item factors `Q` fixed and solve for all user factors `P`.
2. Hold user factors `P` fixed and solve for all item factors `Q`.
3. Repeat for the configured number of iterations.

The training script:

- Removes duplicate `(user_id, parent_asin)` interactions.
- Encodes string IDs into contiguous integer indices.
- Performs a chronological leave-last-out split:
  - Earlier interactions: training set
  - Second-to-last interaction: validation set
  - Last interaction: test set
- Tunes `factors`, `regularization`, and `alpha` using NDCG@10.
- Evaluates Precision@10, Recall@10, and NDCG@10.
- Saves user factors, item factors, and ID mappings.

At serving time, the backend loads these artifacts and calculates ALS scores
for a warm user by multiplying the user's latent vector by every item vector:

```python
als_score(u, i) = item_factors[i] · user_factors[u]
```

The highest-scoring valid items become the ALS candidate set. The production
implementation calculates this in
[`RecommenderEngine._get_als_candidates`](systems/backend/recommender.py#L593).

### 2. Content-based filtering

Content-based filtering represents each product as a TF-IDF vector. The
product text is built from available metadata fields such as title,
description, features, and categories.

The text preprocessing pipeline:

1. Removes HTML and control characters.
2. Normalizes whitespace and full-width characters.
3. Converts text to lowercase tokens.
4. Removes English stop words and one-character tokens.
5. Applies Porter stemming.
6. Adds unigrams and bigrams.
7. Builds a sparse TF-IDF matrix, with one row per product.

For term `t` and product document `d`, TF-IDF is conceptually:

```text
tfidf(t,d) = tf(t,d) * log(N / df(t))
```

where `N` is the number of products and `df(t)` is the number of products
containing the term. Frequently occurring terms receive less weight, while
terms that distinguish a smaller group of products receive more weight.

#### Building the user profile

At request time, the backend reads the user's recent events and uses up to the
last 10 events to construct a preference vector. Each event contributes its
product TF-IDF vector with a behavioral weight:

| Event | Weight |
|---|---:|
| Click/view | 1.0 |
| Search | 1.5 |
| Cart | 3.0 |
| Review | 4.0 |
| Order | 5.0 |

For a user with event set `E`, the profile is:

```text
profile_u =
    normalize( Σ(e in E) weight(e) * tfidf_vector(product(e))
               / Σ(e in E) |weight(e)| )
```

The similarity between the profile and a candidate product is cosine
similarity:

```text
cbf_score(u, i) =
    profile_u · product_vector_i
    ----------------------------
    ||profile_u|| ||product_vector_i||
```

Products with the highest cosine similarity become the content-based
candidate set. This favors products with similar language, categories, and
descriptive attributes to the user's observed interests.

The serving implementation is split across
[`RecommenderEngine._build_user_profile_vector`](systems/backend/recommender.py#L528)
and
[`RecommenderEngine._get_cbf_candidates`](systems/backend/recommender.py#L570).

### 3. Fusing ALS and content-based recommendations

The system uses a two-stage hybrid recommender for warm users.

#### Stage 1: candidate generation

The backend generates up to 100 candidates from each model:

```text
ALS candidates:  top products by latent-factor dot product
CBF candidates:  top products by profile/product cosine similarity
candidate pool:  union(ALS candidates, CBF candidates)
```

The union is important because it preserves products discovered by either
model. Products appearing in both lists retain both scores. Products appearing
in only one list have their missing score calculated against the same
candidate pool.

#### Stage 2: score normalization and weighted fusion

ALS dot products are not naturally on the same scale as cosine similarities.
Therefore, ALS scores are min-max normalized within the candidate pool:

```text
cf_score(u,i) =
    (als_score(u,i) - min_pool_als)
    ------------------------------
    max_pool_als - min_pool_als
```

If all ALS scores are equal, the implementation uses a safe range of `1.0`.
The final hybrid score is:

```text
hybrid_score(u,i) =
    0.6 * cf_score(u,i)
  + 0.4 * cbf_score(u,i)
```

The current weights give collaborative filtering more influence because ALS
captures patterns learned from the full interaction population, while the
content signal improves item relevance and helps with less frequently
interacted products. The final list is sorted by `hybrid_score` and truncated
to `k` products.

Conceptually, the serving flow is:

```python
als = generate_als_candidates(user_id, limit=100)
cbf = generate_cbf_candidates(user_profile, limit=100)
pool = union_by_product_id(als, cbf)

for item in pool:
    item.cf_score = min_max_normalize(item.als_score, pool)
    item.cbf_score = cosine_similarity(profile, item.vector)
    item.score = 0.6 * item.cf_score + 0.4 * item.cbf_score

return sort_descending(pool, key="score")[:k]
```

Already reviewed products and placeholder products are excluded before the
final ranking.

### 4. Cold-start behavior

The system switches strategy when ALS cannot represent the user:

| User state | Recommendation strategy |
|---|---|
| Warm user: ID exists in ALS mappings | 60% normalized ALS + 40% CBF |
| Cold user with interaction history | Pure CBF using the user's recent events |
| Cold user without history | Popular products by normalized review count |

This avoids requesting a missing user latent vector and gives new users a
reasonable fallback. Once sufficient interaction data is available and the
user is included in a retrained ALS model, the warm-user hybrid flow can be
used.

## Recommendation pipeline

1. Product and review data are imported into PostgreSQL.
2. The backend loads trained ALS factors, ID mappings, and item embeddings.
3. Product text is loaded into the TF-IDF/content-based index.
4. User events are retrieved from interactions and reviews.
5. The backend selects the warm-user or cold-start branch.
6. Warm users receive the 100+100 candidate union and weighted fusion.
7. Seen/reviewed products are filtered, ranked, and returned by
   `/recommend/{user_id}`.
8. Frontend clicks, searches, cart actions, orders, and reviews are recorded
   through `/user/{user_id}/event`.

## Thesis evaluation and reproducibility

When reporting results, keep the following details with each experiment:

- Dataset version and duplicate-removal rule
- Temporal train/validation/test split
- ALS factors, regularization, alpha, and iterations
- TF-IDF fields, tokenizer, stemming, n-gram range, and vocabulary settings
- Hybrid weights (`0.6` ALS and `0.4` CBF)
- Candidate limits (`100` per model)
- Precision@K, Recall@K, and NDCG@K
- Cold-start and warm-user evaluation separately

The architecture analysis is available in
[`graphify-out/GRAPH_REPORT.md`](graphify-out/GRAPH_REPORT.md).

## Notes

- Model files and datasets are runtime inputs and may be large.
- Reproducible experiments should record dataset versions, preprocessing
  settings, model dimensions, and evaluation splits.
- Never commit passwords, tokens, `.env` files, or generated private data.
# als-cbf-hybrid-recommender
