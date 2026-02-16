import pandas as pd
import matplotlib.pyplot as plt

# ================================
# LOAD FAULT DATA
# ================================
df = pd.read_csv("data/Plant_1_Faults_Detected.csv")

# Convert datetime
df["DATE_TIME"] = pd.to_datetime(df["DATE_TIME"])
df["DATE"] = df["DATE_TIME"].dt.date

# ================================
# DAILY FAULT AGGREGATION
# ================================
daily_faults = df.groupby("DATE").agg(
    TOTAL_SAMPLES=("FAULT_FLAG", "count"),
    FAULT_COUNT=("FAULT_FLAG", "sum")
).reset_index()

daily_faults["FAULT_PERCENTAGE"] = (
    daily_faults["FAULT_COUNT"] / daily_faults["TOTAL_SAMPLES"]
) * 100

# ================================
# OUTPUT
# ================================
print("\n=== DAILY FAULT SUMMARY ===")
print(daily_faults.head())

print("\n=== WORST FAULT DAYS ===")
print(
    daily_faults.sort_values("FAULT_PERCENTAGE", ascending=False).head(5)
)

# Save results
output_path = "data/Plant_1_Daily_Fault_Summary.csv"
daily_faults.to_csv(output_path, index=False)
print(f"\nSaved: {output_path}")

# ================================
# VISUALIZATION
# ================================
plt.figure(figsize=(10, 5))
plt.plot(daily_faults["DATE"], daily_faults["FAULT_COUNT"], marker="o")
plt.title("Daily Fault Count – Plant 1")
plt.xlabel("Date")
plt.ylabel("Number of Faults")
plt.grid(True)
plt.tight_layout()
plt.show()
