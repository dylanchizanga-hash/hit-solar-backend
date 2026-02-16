import pandas as pd
import matplotlib.pyplot as plt

# Load merged data
df = pd.read_csv("data/Plant_1_Merged_Data.csv", parse_dates=["DATE_TIME"])

# -----------------------------
# AC Power vs Irradiation
# -----------------------------
plt.figure()
plt.scatter(df["IRRADIATION"], df["AC_POWER"], alpha=0.5)
plt.xlabel("Irradiation (W/m²)")
plt.ylabel("AC Power (kW)")
plt.title("AC Power vs Solar Irradiation")
plt.show()

# -----------------------------
# Daily Energy Trend
# -----------------------------
df["DATE"] = df["DATE_TIME"].dt.date
daily_energy = df.groupby("DATE")["DAILY_YIELD"].max()

plt.figure()
daily_energy.plot()
plt.xlabel("Date")
plt.ylabel("Daily Energy Yield")
plt.title("Daily Solar Energy Production")
plt.show()
