import pandas as pd

# -----------------------------
# CONFIG
# -----------------------------
TARIFF_PER_KWH = 0.10
SAMPLING_HOURS = 0.25  # 15 min data

# -----------------------------
# LOAD
# -----------------------------
df = pd.read_csv("data/Plant_1_Faults_Detected.csv")

print("\nAvailable columns:")
print(df.columns.tolist())

# -----------------------------
# DETECT ERROR / POWER LOSS
# -----------------------------
error_col = None

POSSIBLE_ERROR_COLS = [
    "error",
    "ERROR",
    "POWER_ERROR",
    "ABS_ERROR",
    "PREDICTION_ERROR",
    "ERROR_W",
    "POWER_DIFF"
]

for col in POSSIBLE_ERROR_COLS:
    if col in df.columns:
        error_col = col
        break

if error_col:
    df["Power_Loss_W"] = df[error_col].abs()
else:
    # Try power column subtraction
    power_pairs = [
        ("AC_POWER", "PREDICTED_AC_POWER"),
        ("DC_POWER", "PREDICTED_DC_POWER"),
        ("DC_POWER", "PREDICTED_POWER"),
        ("AC_POWER", "PREDICTED_POWER")
    ]

    found = False
    for actual, predicted in power_pairs:
        if actual in df.columns and predicted in df.columns:
            df["Power_Loss_W"] = (df[actual] - df[predicted]).abs()
            found = True
            break

    if not found:
        raise ValueError(
            "❌ No usable error or power columns found.\n"
            "Check printed column list above."
        )

# -----------------------------
# FAULT FLAG
# -----------------------------
fault_col = None
for col in ["FAULT_FLAG", "FAULT", "fault"]:
    if col in df.columns:
        fault_col = col
        break

if fault_col is None:
    raise ValueError("No fault flag column found")

# -----------------------------
# ENERGY & COST
# -----------------------------
df["Energy_Loss_kWh"] = (df["Power_Loss_W"] / 1000) * SAMPLING_HOURS
df["Revenue_Loss_USD"] = df["Energy_Loss_kWh"] * TARIFF_PER_KWH

faults = df[df[fault_col] == 1]

total_energy = faults["Energy_Loss_kWh"].sum()
total_revenue = faults["Revenue_Loss_USD"].sum()

days = (len(df) * SAMPLING_HOURS) / 24

print("\n=== FINANCIAL LOSS SUMMARY ===")
print(f"Monitoring days        : {days:.2f}")
print(f"Total energy lost (kWh): {total_energy:.2f}")
print(f"Total revenue lost ($) : {total_revenue:.2f}")
print("--------------------------------")
print(f"Estimated DAILY loss   : ${total_revenue/days:.2f}")
print(f"Estimated MONTHLY loss : ${(total_revenue/days)*30:.2f}")
print(f"Estimated ANNUAL loss  : ${(total_revenue/days)*365:.2f}")

# -----------------------------
# SAVE
# -----------------------------
faults.to_csv("data/Plant_1_Financial_Loss_Report.csv", index=False)
print("\n✅ Saved: data/Plant_1_Financial_Loss_Report.csv")
