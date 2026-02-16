import pandas as pd

# -----------------------------
# 1. LOAD DATA
# -----------------------------
generation = pd.read_csv("data/Plant_1_Generation_Data.csv")
weather = pd.read_csv("data/Plant_1_Weather_Sensor_Data.csv")

print("\n=== GENERATION DATA (RAW) ===")
print(generation.head())
print(generation.info())

print("\n=== WEATHER DATA (RAW) ===")
print(weather.head())
print(weather.info())

# -----------------------------
# 2. FIX DATE_TIME FORMATS
# -----------------------------
generation["DATE_TIME"] = pd.to_datetime(
    generation["DATE_TIME"],
    format="%d-%m-%Y %H:%M",
    errors="coerce"
)

weather["DATE_TIME"] = pd.to_datetime(
    weather["DATE_TIME"],
    errors="coerce"
)

# -----------------------------
# 3. VALIDATION
# -----------------------------
print("\n=== DATETIME VALIDATION ===")
print("Generation nulls:", generation["DATE_TIME"].isna().sum())
print("Weather nulls:", weather["DATE_TIME"].isna().sum())

# Remove bad rows (safety)
generation.dropna(subset=["DATE_TIME"], inplace=True)
weather.dropna(subset=["DATE_TIME"], inplace=True)

# -----------------------------
# 4. AGGREGATE GENERATION DATA
# -----------------------------
# Weather is per 15 min; generation is per inverter
generation_agg = (
    generation
    .groupby(["DATE_TIME", "PLANT_ID"], as_index=False)
    .agg({
        "DC_POWER": "sum",
        "AC_POWER": "sum",
        "DAILY_YIELD": "sum",
        "TOTAL_YIELD": "max"
    })
)

# -----------------------------
# 5. MERGE DATASETS
# -----------------------------
merged = pd.merge(
    generation_agg,
    weather,
    on=["DATE_TIME", "PLANT_ID"],
    how="left"
)

print("\n=== MERGED DATA ===")
print(merged.head())
print(merged.info())

# -----------------------------
# 6. SAVE CLEAN DATA
# -----------------------------
merged.to_csv("data/Plant_1_Merged_Data.csv", index=False)

print("\n✅ SUCCESS")
print("Clean dataset saved as: data/Plant_1_Merged_Data.csv")
