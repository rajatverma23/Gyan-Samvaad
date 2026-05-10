import pandas as pd
from sklearn.model_selection import train_test_split

# File paths
input_file = "/storage/rajat/gyan-samvaad-models/dataset/all-dataset.csv"
train_file = "/storage/rajat/gyan-samvaad-models/dataset/dataset-train.csv"
test_file = "/storage/rajat/gyan-samvaad-models/dataset/dataset-test.csv"

SEED = 42

# Load CSV
df = pd.read_csv(input_file)

# Keep only required columns
df = df[["Question", "Answer"]]

# Drop rows with missing values (optional but recommended)
df = df.dropna(subset=["Question", "Answer"])

# Split data (80% train, 20% test) with shuffling and fixed seed
train_df, test_df = train_test_split(
    df,
    test_size=0.2,
    random_state=SEED,
    shuffle=True
)

# Save to CSV
train_df.to_csv(train_file, index=False)
test_df.to_csv(test_file, index=False)

print(f"Train file saved to: {train_file}")
print(f"Test file saved to: {test_file}")