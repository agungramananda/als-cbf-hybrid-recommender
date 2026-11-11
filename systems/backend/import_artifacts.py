import os
import json
import numpy as np
import pandas as pd
import shutil

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_SYSTEMS_DIR = os.path.dirname(_BASE_DIR)

MODELS_DIR = os.getenv("MODELS_DIR", os.path.join(_SYSTEMS_DIR, "models"))
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", os.path.join(_BASE_DIR, "artifacts"))

def main():
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    print("=" * 60)
    print("IMPORTING TRAINED MODEL ARTIFACTS TO BACKEND")
    print("=" * 60)

    # 1. Process User Mapping
    user_map_path = os.path.join(MODELS_DIR, "user_mapping.csv")
    user_json_path = os.path.join(ARTIFACTS_DIR, "user_id_map.json")
    print(f"[*] Loading user mapping from {user_map_path}...")
    user_df = pd.read_csv(user_map_path)
    user_map = dict(zip(user_df["user_id"].astype(str), user_df["user_idx"].astype(int)))
    print(f"[*] Writing user_id_map.json ({len(user_map)} mapped users)...")
    with open(user_json_path, "w") as f:
        json.dump(user_map, f)
    del user_df
    del user_map

    # 2. Process Item Mapping
    item_map_path = os.path.join(MODELS_DIR, "item_mapping.csv")
    item_json_path = os.path.join(ARTIFACTS_DIR, "item_id_map.json")
    print(f"[*] Loading item mapping from {item_map_path}...")
    item_df = pd.read_csv(item_map_path)
    item_map = dict(zip(item_df["parent_asin"].astype(str), item_df["item_idx"].astype(int)))
    print(f"[*] Writing item_id_map.json ({len(item_map)} mapped products)...")
    with open(item_json_path, "w") as f:
        json.dump(item_map, f)
    del item_df
    del item_map

    # 3. Extract ALS Latent Factors
    model_npz_path = os.path.join(MODELS_DIR, "best_model.npz")
    user_fac_path = os.path.join(ARTIFACTS_DIR, "user_factors.npy")
    item_fac_path = os.path.join(ARTIFACTS_DIR, "item_factors.npy")
    print(f"[*] Extracting ALS user & item factors from {model_npz_path}...")
    archive = np.load(model_npz_path)
    
    print("[*] Saving user_factors.npy...")
    np.save(user_fac_path, archive["user_factors"])
    print("[*] Saving item_factors.npy...")
    np.save(item_fac_path, archive["item_factors"])
    del archive

    # 4. CBF Embeddings: Not needed.
    #    Content-Based Filtering now uses TF-IDF, which is built dynamically
    #    from the product catalog in PostgreSQL at backend startup.
    #    No pre-trained embedding file (e.g., SBERT/NAML) is required.

    print("=" * 60)
    print("TRAINED MODEL ARTIFACTS IMPORTED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    main()
