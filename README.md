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

## Recommendation pipeline

1. Product and review data are imported into PostgreSQL.
2. The backend loads trained ALS factors and item embeddings.
3. Product text is processed into search and content-based indexes.
4. ALS generates collaborative candidates for users with interaction history.
5. Content-based candidates are generated from the user's profile and product
   representations.
6. Candidate results are combined and returned by `/recommend/{user_id}`.
7. Frontend interactions are recorded through `/user/{user_id}/event`.

The main implementation is in
[`systems/backend/recommender.py`](systems/backend/recommender.py).

## Thesis documentation

For detailed architecture notes and thesis reproducibility checkpoints, see
[`PROJECT_DOCUMENTATION.md`](PROJECT_DOCUMENTATION.md).

The generated architecture analysis is available in
[`graphify-out/GRAPH_REPORT.md`](graphify-out/GRAPH_REPORT.md).

## Notes

- Model files and datasets are runtime inputs and may be large.
- Reproducible experiments should record dataset versions, preprocessing
  settings, model dimensions, and evaluation splits.
- Never commit passwords, tokens, `.env` files, or generated private data.
# als-cbf-hybrid-recommender
