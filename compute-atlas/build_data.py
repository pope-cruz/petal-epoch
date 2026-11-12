"""Generate the browser dataset from Epoch AI's full catalog."""
import csv
import json
from pathlib import Path

root = Path(__file__).resolve().parent
source = root.parent / "ai_models" / "all_ai_models.csv"

with source.open(encoding="utf-8", newline="") as file:
    records = [{
        "name": row["Model"],
        "org": row["Organization"],
        "date": row["Publication date"],
        "domains": [domain.strip() for domain in row["Domain"].split(",") if domain.strip()],
        "compute": float(row["Training compute (FLOP)"]) if row["Training compute (FLOP)"] else None,
        "cost": float(row["Training compute cost (2023 USD)"]) if row["Training compute cost (2023 USD)"] else None,
        "link": row["Link"],
    } for row in csv.DictReader(file)]

payload = json.dumps(records, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
(root / "dist" / "data.js").write_text(f"const models = {payload};\n", encoding="utf-8")
