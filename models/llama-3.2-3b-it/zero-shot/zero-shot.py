import pandas as pd
import torch
from transformers import pipeline
from tqdm import tqdm

# File paths
test_file = "/storage/rajat/gyan-samvaad-models/dataset/dataset-test.csv"
output_file = "/storage/rajat/gyan-samvaad-models/llama-3.2-3b-it/zero-shot/zero-shot-predictions.csv"

# Parameters
BATCH_SIZE = 8
MAX_NEW_TOKENS = 128

# Load data
df = pd.read_csv(test_file)
df = df[["Question", "Answer"]].dropna()

questions = df["Question"].tolist()

# Load pipeline
model_id = "meta-llama/Llama-3.2-3B-Instruct"

pipe = pipeline(
    "text-generation",
    model=model_id,
    torch_dtype=torch.bfloat16,
    device_map="auto",
)

predictions = []

# Helper: batching
def get_batches(lst, batch_size):
    for i in range(0, len(lst), batch_size):
        yield lst[i:i + batch_size]

# Inference loop
for batch_questions in tqdm(get_batches(questions, BATCH_SIZE), desc="Batch inference"):

    batch_messages = [
        [
            {"role": "system", "content": "You are a Yoga expert in Hindi Language. Answer concisely."},
            {"role": "user", "content": q},
        ]
        for q in batch_questions
    ]

    outputs = pipe(
        batch_messages,
        max_new_tokens=MAX_NEW_TOKENS,
        do_sample=False
    )

    # Extract generated answers
    for output in outputs:
        generated = output[0]["generated_text"]
        
        # Last message contains model response
        answer = generated[-1]["content"].strip()
        predictions.append(answer)

# Save results
df["Prediction"] = predictions
df.to_csv(output_file, index=False)

print(f"Predictions saved to: {output_file}")