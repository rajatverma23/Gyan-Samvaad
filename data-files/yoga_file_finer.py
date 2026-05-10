import pandas as pd
import json

# ========= CONFIG =========
csv_path = "General_Yoga_Questions.csv"      
output_jsonl = "General_Yoga_Questions.jsonl" 

TYPE_VALUE = "General-Yoga-Questions"
QUESTION_TYPE_VALUE = "question_answer"

# =========================

# Read CSV
df = pd.read_csv(csv_path)

# Rename column (CSV has "References")
df = df.rename(columns={
    "References": "reference_link"
})

with open(output_jsonl, "w", encoding="utf-8") as f:
    for idx, row in df.iterrows():
        record = {
            "id": idx + 1,
            "type": TYPE_VALUE,
            "question_type": QUESTION_TYPE_VALUE,
            "Questions": str(row["Questions"]).strip(),
            "Answer": str(row["Answer"]).strip(),
            "reference_link": str(row["reference_link"]).strip()
        }

        f.write(json.dumps(record, ensure_ascii=False) + "\n")

print("✅ JSONL file created:", output_jsonl)
