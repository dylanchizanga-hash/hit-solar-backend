import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

from sklearn.linear_model import LinearRegression
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

# -----------------------------
# 1. LOAD DATA
# -----------------------------
df = pd.read_csv("data/Plant_1_Merged_Data.csv", parse_dates=["DATE_TIME"])

# Feature engineering
df["HOUR"] = df["DATE_TIME"].dt.hour

features = [
    "IRRADIATION",
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "HOUR"
]

X = df[features]
y_actual = df["AC_POWER"]

# -----------------------------
# 2. MODEL PIPELINE (SAME AS TRAINING)
# -----------------------------
pipeline = Pipeline(steps=[
    ("imputer", SimpleImputer(strategy="mean")),
    ("model", LinearRegression())
])

pipeline.fit(X, y_actual)

# -----------------------------
# 3. PREDICTION
# -----------------------------
df["AC_POWER_PREDICTED"] = pipeline.predict(X)

# -----------------------------
# 4. ERROR ANALYSIS
# -----------------------------
df["ERROR"] = df["AC_POWER"] - df["AC_POWER_PREDICTED"]
df["ABS_ERROR"] = df["ERROR"].abs()

# Threshold: 2 standard deviations
error_threshold = 2 * df["ABS_ERROR"].std()

df["FAULT_FLAG"] = df["ABS_ERROR"] > error_threshold

# -----------------------------
# 5. FAULT SUMMARY
# -----------------------------
total_points = len(df)
fault_points = df["FAULT_FLAG"].sum()

print("\n=== FAULT DETECTION SUMMARY ===")
print(f"Total samples      : {total_points}")
print(f"Faulty samples     : {fault_points}")
print(f"Fault percentage   : {fault_points / total_points * 100:.2f}%")
print(f"Error threshold (W): {error_threshold:.2f}")

# -----------------------------
# 6. SAVE FAULT DATA
# -----------------------------
fault_df = df[df["FAULT_FLAG"]]
fault_df.to_csv("data/Plant_1_Faults_Detected.csv", index=False)

print("\nFault report saved as:")
print("data/Plant_1_Faults_Detected.csv")

# -----------------------------
# 7. VISUALIZATION
# -----------------------------
plt.figure(figsize=(12, 5))
plt.plot(df["DATE_TIME"], df["AC_POWER"], label="Actual AC Power", alpha=0.7)
plt.plot(df["DATE_TIME"], df["AC_POWER_PREDICTED"], label="Predicted AC Power", alpha=0.7)
plt.legend()
plt.title("Actual vs Predicted AC Power")
plt.xlabel("Time")
plt.ylabel("Power (W)")
plt.tight_layout()
plt.show()

plt.figure(figsize=(12, 4))
plt.plot(df["DATE_TIME"], df["ABS_ERROR"], label="Absolute Error")
plt.axhline(error_threshold, color="red", linestyle="--", label="Fault Threshold")
plt.legend()
plt.title("Prediction Error and Fault Threshold")
plt.xlabel("Time")
plt.ylabel("Error (W)")
plt.tight_layout()
plt.show()
