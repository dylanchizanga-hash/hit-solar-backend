import pandas as pd

# ==============================
# LOAD DATA
# ==============================
df = pd.read_csv("data/Plant_1_Faults_Detected.csv")
df["DATE_TIME"] = pd.to_datetime(df["DATE_TIME"])

# ==============================
# AUTO-DETECT FAULT COLUMN
# ==============================
possible_fault_cols = ["FAULT", "IS_FAULT", "FAULT_FLAG"]
fault_col = None

for col in possible_fault_cols:
    if col in df.columns:
        fault_col = col
        break

if fault_col is None:
    raise ValueError("No fault indicator column found!")

print(f"Using fault column: {fault_col}")

# ==============================
# INVERTER-LEVEL AGGREGATION
# ==============================
inverter_summary = (
    df.groupby("SOURCE_KEY")
    .agg(
        total_samples=("AC_POWER", "count"),
        fault_count=(fault_col, "sum"),
        avg_error=("ERROR", "mean"),
        max_error=("ERROR", "max")
    )
    .reset_index()
)

# ==============================
# FAULT RATE
# ==============================
inverter_summary["fault_rate_percent"] = (
    inverter_summary["fault_count"] / inverter_summary["total_samples"] * 100
)

# ==============================
# SORT WORST FIRST
# ==============================
inverter_summary = inverter_summary.sort_values(
    by="fault_rate_percent", ascending=False
)

# ==============================
# OUTPUT
# ==============================
print("\n=== INVERTER FAULT ANALYSIS ===")
print(inverter_summary.head(10))

output_path = "data/Plant_1_Inverter_Fault_Ranking.csv"
inverter_summary.to_csv(output_path, index=False)

print(f"\n✅ Saved to {output_path}")
