import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from tqdm import tqdm

# File paths
test_file = "/storage/rajat/gyan-samvaad-models/dataset/dataset-test.csv"
output_file = "/storage/rajat/gyan-samvaad-models/gemma-2-2b-it/zero-shot/zero-shot-predictions.csv"

# Parameters
BATCH_SIZE = 16
MAX_NEW_TOKENS = 128

# Load data
df = pd.read_csv(test_file)
df = df[["Question", "Answer"]].dropna()

questions = df["Question"].tolist()

# Load model
model_name = "google/gemma-2-2b-it"

tokenizer = AutoTokenizer.from_pretrained(model_name)

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    device_map="auto",
    torch_dtype=torch.bfloat16,
)

model.eval()

predictions = []

# Helper: create batches
def get_batches(lst, batch_size):
    for i in range(0, len(lst), batch_size):
        yield lst[i:i + batch_size]

# Inference loop (batched)
for batch_questions in tqdm(get_batches(questions, BATCH_SIZE), desc="Batch inference"):

    prompts = [
        f"""You are a helpful Yoga expert in Hindi language.
Answer the question concisely and accurately.

Question: {q}
Answer:"""
        for q in batch_questions
    ]

    inputs = tokenizer(
        prompts,
        return_tensors="pt",
        padding=True,
        truncation=True
    ).to("cuda")

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False
        )

    decoded_outputs = tokenizer.batch_decode(outputs, skip_special_tokens=True)

    # Extract answers
    for prompt, decoded in zip(prompts, decoded_outputs):
        answer = decoded.replace(prompt, "").strip()
        predictions.append(answer)

# Save results
df["Prediction"] = predictions
df.to_csv(output_file, index=False)

print(f"Predictions saved to: {output_file}")