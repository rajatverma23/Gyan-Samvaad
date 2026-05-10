import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from tqdm import tqdm
from parsers import parse_model_output

# File paths
test_file = "/storage/rajat/gyan-samvaad-models/dataset/dataset-test.csv"
output_file = "/storage/rajat/gyan-samvaad-models/param-2/zero-shot/zero-shot-predictions.csv"

# Parameters
BATCH_SIZE = 8
MAX_NEW_TOKENS = 128

# Load data
df = pd.read_csv(test_file)
df = df[["Question", "Answer"]].dropna()

questions = df["Question"].tolist()

# Load model
model_name = "bharatgenai/Param2-17B-A2.4B-Thinking"

tokenizer = AutoTokenizer.from_pretrained(
    model_name,
    trust_remote_code=False
)

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    trust_remote_code=True,
    device_map="auto",
    torch_dtype=torch.bfloat16
)

model.eval()

predictions = []

# Helper: batching
def get_batches(lst, batch_size):
    for i in range(0, len(lst), batch_size):
        yield lst[i:i + batch_size]

# Inference loop
for batch_questions in tqdm(get_batches(questions, BATCH_SIZE), desc="Batch inference"):

    conversations = [
        [
            {"role": "system", "content": "You are a Yoga expert in Hindi Language."},
            {"role": "user", "content": q}
        ]
        for q in batch_questions
    ]

    # Tokenize batch using chat template
    inputs = tokenizer.apply_chat_template(
        conversation=conversations,
        return_tensors="pt",
        padding=True,
        truncation=True,
        add_generation_prompt=True
    ).to(model.device)

    with torch.inference_mode():
        outputs = model.generate(
            inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False,
            eos_token_id=tokenizer.eos_token_id,
            use_cache=True,
        )

    # Decode each sample separately
    for i in range(outputs.shape[0]):
        generated_tokens = outputs[i][inputs.shape[1]:]

        generated_text = tokenizer.decode(
            generated_tokens,
            skip_special_tokens=False
        )

        # print(f"Generated Text: {generated_text}")

        # try:
        #     parsed = parse_model_output(generated_text)
        #     answer = parsed.get("final_answer", "").strip()
        # except Exception:
        #     answer = generated_text.strip()

        predictions.append(generated_text)

# Save results
df["Prediction"] = predictions
df.to_csv(output_file, index=False)

print(f"Predictions saved to: {output_file}")