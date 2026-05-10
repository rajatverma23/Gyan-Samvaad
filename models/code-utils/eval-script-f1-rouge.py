import pandas as pd
import re
import argparse
from collections import Counter
from rouge_score import rouge_scorer
from tqdm import tqdm

# ----------------------------
# Argument parser
# ----------------------------
parser = argparse.ArgumentParser(description="Evaluate Token-F1 and ROUGE scores")
parser.add_argument("--input_csv", type=str, required=True, help="Path to input CSV file")
parser.add_argument("--output_csv", type=str, required=True, help="Path to save detailed results")
args = parser.parse_args()

# ----------------------------
# Load data
# ----------------------------
df = pd.read_csv(args.input_csv)
df = df[["Answer", "Prediction"]].dropna()

# ----------------------------
# Text normalization
# ----------------------------
def normalize_text(text):
    text = str(text).lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

# ----------------------------
# Token F1
# ----------------------------
def compute_f1(prediction, ground_truth):
    pred_tokens = normalize_text(prediction).split()
    gt_tokens = normalize_text(ground_truth).split()

    common = Counter(pred_tokens) & Counter(gt_tokens)
    num_same = sum(common.values())

    if len(pred_tokens) == 0 or len(gt_tokens) == 0:
        return int(pred_tokens == gt_tokens)

    if num_same == 0:
        return 0.0

    precision = num_same / len(pred_tokens)
    recall = num_same / len(gt_tokens)

    return (2 * precision * recall) / (precision + recall)

# ----------------------------
# ROUGE scorer
# ----------------------------
scorer = rouge_scorer.RougeScorer(
    ["rouge1", "rouge2", "rougeL"],
    use_stemmer=True
)

# ----------------------------
# Evaluation loop
# ----------------------------
f1_scores = []
rouge1_scores = []
rouge2_scores = []
rougeL_scores = []

for _, row in tqdm(df.iterrows(), total=len(df), desc="Evaluating"):
    pred = str(row["Prediction"])
    gt = str(row["Answer"])

    f1 = compute_f1(pred, gt)
    scores = scorer.score(gt, pred)

    f1_scores.append(f1)
    rouge1_scores.append(scores["rouge1"].fmeasure)
    rouge2_scores.append(scores["rouge2"].fmeasure)
    rougeL_scores.append(scores["rougeL"].fmeasure)

# ----------------------------
# Add per-example scores
# ----------------------------
df["Token_F1"] = f1_scores
df["ROUGE-1"] = rouge1_scores
df["ROUGE-2"] = rouge2_scores
df["ROUGE-L"] = rougeL_scores

# Save detailed results
df.to_csv(args.output_csv, index=False)

# ----------------------------
# Print averages
# ----------------------------
print("\n===== Evaluation Results =====")
print(f"Token F1       : {sum(f1_scores)/len(f1_scores):.4f}")
print(f"ROUGE-1 (F1)   : {sum(rouge1_scores)/len(rouge1_scores):.4f}")
print(f"ROUGE-2 (F1)   : {sum(rouge2_scores)/len(rouge2_scores):.4f}")
print(f"ROUGE-L (F1)   : {sum(rougeL_scores)/len(rougeL_scores):.4f}")

print(f"\nDetailed results saved to: {args.output_csv}")