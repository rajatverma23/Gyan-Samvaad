import pandas as pd
import torch
from datasets import Dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, prepare_model_for_kbit_training
from trl import SFTTrainer, SFTConfig
import evaluate

# =========================
# CONFIG
# =========================
model_id = "meta-llama/Llama-3.2-3B-Instruct"

train_file = "/storage/rajat/gyan-samvaad-models/dataset/dataset-train.csv"
val_file = "/storage/rajat/gyan-samvaad-models/dataset/dataset-test.csv"

output_dir = "./qlora-sft-llama"

MAX_LENGTH = 512

# =========================
# LOAD DATA
# =========================
train_df = pd.read_csv(train_file)[["Question", "Answer"]].dropna()
val_df = pd.read_csv(val_file)[["Question", "Answer"]].dropna()

train_dataset = Dataset.from_pandas(train_df)
val_dataset = Dataset.from_pandas(val_df)

# =========================
# TOKENIZER
# =========================
tokenizer = AutoTokenizer.from_pretrained(model_id)
tokenizer.pad_token = tokenizer.eos_token

# =========================
# CHAT FORMAT FUNCTION
# =========================
def format_chat(example):
    messages = [
        {"role": "system", "content": "You are a Yoga expert in Hindi Language. Answer concisely."},
        {"role": "user", "content": example["Question"]},
        {"role": "assistant", "content": example["Answer"]},
    ]
    
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=False
    )
    
    return {"text": text}

train_dataset = train_dataset.map(format_chat)
val_dataset = val_dataset.map(format_chat)

# =========================
# MODEL (QLoRA)
# =========================
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4"
)

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=bnb_config,
    dtype=torch.bfloat16,        
    device_map="auto"
)

model = prepare_model_for_kbit_training(model)

# =========================
# LORA CONFIG
# =========================
peft_config = LoraConfig(
    r=32,           
    lora_alpha=64,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

# =========================
# QA F1 METRIC
# =========================
squad_metric = evaluate.load("squad")

def compute_metrics(eval_preds):
    preds, labels = eval_preds

    decoded_preds = tokenizer.batch_decode(preds, skip_special_tokens=True)
    decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

    predictions = []
    references = []

    for i in range(len(decoded_preds)):
        pred = decoded_preds[i].strip()
        label = decoded_labels[i].strip()

        predictions.append({
            "id": str(i),
            "prediction_text": pred
        })

        references.append({
            "id": str(i),
            "answers": {
                "text": [label],
                "answer_start": [0]
            }
        })

    return squad_metric.compute(
        predictions=predictions,
        references=references
    )

# =========================
# SFT CONFIG (IMPORTANT)
# =========================
training_args = SFTConfig(
    output_dir=output_dir,

    # batching
    per_device_train_batch_size=2,
    per_device_eval_batch_size=1,
    gradient_accumulation_steps=2,

    # training
    num_train_epochs=6,
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    warmup_ratio=0.1,

    # logging
    logging_steps=10,
    eval_strategy="epoch",
    save_strategy="epoch",

    # precision
    bf16=True,

    # best model selection
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    greater_is_better=False,

    # IMPORTANT for QA
    max_length=MAX_LENGTH,
    packing=False, 

    report_to="wandb"
)

# =========================
# TRAINER
# =========================
trainer = SFTTrainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    processing_class=tokenizer,
    peft_config=peft_config
)

# =========================
# TRAIN
# =========================
trainer.train()

trainer.save_model(output_dir)

print("Training complete!")