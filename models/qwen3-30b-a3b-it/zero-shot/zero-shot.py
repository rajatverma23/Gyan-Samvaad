import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from tqdm import tqdm

# File paths
test_file = "/storage/rajat/gyan-samvaad-models/dataset/dataset-test.csv"
output_file = "/storage/rajat/gyan-samvaad-models/qwen3-30b-a3b-it/zero-shot/zero-shot-predictions-max-tokens-256.csv"

# Parameters
BATCH_SIZE = 4
MAX_NEW_TOKENS = 256

# Load data
df = pd.read_csv(test_file)
df = df[["Question", "Answer"]].dropna()

questions = df["Question"].tolist()

# Load model
model_name = "Qwen/Qwen3-30B-A3B-Instruct-2507"

tokenizer = AutoTokenizer.from_pretrained(model_name)

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype="auto",
    device_map="auto"
)

model.eval()

predictions = []

# Helper: batching
def get_batches(lst, batch_size):
    for i in range(0, len(lst), batch_size):
        yield lst[i:i + batch_size]

# Inference loop
for batch_questions in tqdm(get_batches(questions, BATCH_SIZE), desc="Batch inference"):

    # Build chat prompts
    messages_batch = [
        [{"role": "user", "content": q}]
        for q in batch_questions
    ]

    # Apply chat template (string format)
    texts = [
        tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        for messages in messages_batch
    ]

    # Tokenize batch
    model_inputs = tokenizer(
        texts,
        return_tensors="pt",
        padding=True,
        truncation=True
    ).to(model.device)

    with torch.inference_mode():
        generated_ids = model.generate(
            **model_inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False 
        )

    # Decode each sample
    for i in range(len(texts)):
        input_len = model_inputs.input_ids[i].shape[0]
        output_ids = generated_ids[i][input_len:]
        
        content = tokenizer.decode(
            output_ids,
            skip_special_tokens=True
        ).strip()

        predictions.append(content)

# Save results
df["Prediction"] = predictions
df.to_csv(output_file, index=False)

print(f"Predictions saved to: {output_file}")