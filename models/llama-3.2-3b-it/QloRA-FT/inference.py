import pandas as pd
import torch
from tqdm import tqdm
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
from peft import PeftModel

# =========================
# CONFIG
# =========================
base_model_id = "meta-llama/Llama-3.2-3B-Instruct"
lora_path = "/storage/rajat/gyan-samvaad-models/llama-3.2-3b-it/QloRA-FT/qlora-sft-llama/checkpoint-232" 

test_file = "/storage/rajat/gyan-samvaad-models/dataset/dataset-test.csv"
output_file = "/storage/rajat/gyan-samvaad-models/llama-3.2-3b-it/QloRA-FT/dataset-test-predictions-232.csv"

BATCH_SIZE = 8
MAX_NEW_TOKENS = 128

# =========================
# LOAD DATA
# =========================
df = pd.read_csv(test_file)[["Question", "Answer"]].dropna()
questions = df["Question"].tolist()

# =========================
# TOKENIZER
# =========================
tokenizer = AutoTokenizer.from_pretrained(base_model_id)
tokenizer.pad_token = tokenizer.eos_token

# =========================
# LOAD MODEL + LORA
# =========================
base_model = AutoModelForCausalLM.from_pretrained(
    base_model_id,
    torch_dtype=torch.bfloat16,
    device_map="auto"
)

model = PeftModel.from_pretrained(base_model, lora_path)

# =========================
# PIPELINE
# =========================
pipe = pipeline(
    "text-generation",
    model=model,
    tokenizer=tokenizer
)

# =========================
# BATCH HELPER
# =========================
def get_batches(lst, batch_size):
    for i in range(0, len(lst), batch_size):
        yield lst[i:i + batch_size]

# =========================
# INFERENCE LOOP
# =========================
predictions = []

for batch_questions in tqdm(get_batches(questions, BATCH_SIZE), desc="Inference"):

    # chat format (IMPORTANT)
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
        do_sample=False,
        temperature=0.0,
        return_full_text=False 
    )

    for output in outputs:
        # pipeline returns list of generations
        answer = output[0]["generated_text"].strip()
        predictions.append(answer)

# =========================
# SAVE
# =========================
df["Prediction"] = predictions
df.to_csv(output_file, index=False)

print(f"Saved to {output_file}")