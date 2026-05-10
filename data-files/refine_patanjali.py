import pandas as pd
import json

# ========= CONFIG =========
csv_path = "Patanjali.csv"
output_jsonl = "Patanjali.jsonl"

TYPE_VALUE = "Yoga-Questions-based-Patanjali-Yoga-Sutras"
QUESTION_TYPE_VALUE = "Question-Answer"
# =========================

# Read CSV
df = pd.read_csv(csv_path).fillna("")

# Drop rows where Question is null/empty/whitespace
df["Question"] = df["Question"].fillna("").astype(str).str.strip()
df = df[df["Question"] != ""]

# Strip column names (important)
df.columns = df.columns.str.strip()

required_cols = [
    "Sanskrit",
    "Book_Name",
    "Romanised_Sanskrit",
    "Question",
    "Hindi_Question",
    "Answer",
    "Hindi_Answer",
    "Reference_Link",
    "Page_Number",
    "Pada",
    "Sutra"
]

missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise ValueError(f"Missing required columns: {missing}")

with open(output_jsonl, "w", encoding="utf-8") as f:
    for idx, row in df.iterrows():
        record = {
            "id": idx + 1,
            "type": TYPE_VALUE,
            "question_type": QUESTION_TYPE_VALUE,
            "Sanskrit": row["Sanskrit"].strip(),
            "Book_Name": row["Book_Name"].strip(),
            "Romanised_Sanskrit": row["Romanised_Sanskrit"].strip(),
            "Question": row["Question"].strip(),
            "Hindi_Question": row["Hindi_Question"].strip(),
            "Answer": row["Answer"].strip(),
            "Hindi_Answer": row["Hindi_Answer"].strip(),
            "Reference": f"{row["Reference_Link"].strip()}  Page Number: {row["Page_Number"]} Sutra Number: {row["Pada"]}.{row["Sutra"]}"
        }

        f.write(json.dumps(record, ensure_ascii=False) + "\n")

print(f"✅ JSONL file created: {output_jsonl} ({len(df)} records)")
