import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

# -----------------------------
# LOAD DATA
# -----------------------------
df = pd.read_csv("data/Plant_1_Merged_Data.csv", parse_dates=["DATE_TIME"])

# -----------------------------
# FEATURE ENGINEERING
# -----------------------------
df["HOUR"] = df["DATE_TIME"].dt.hour

features = [
    "IRRADIATION",
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "HOUR"
]

X = df[features]
y = df["AC_POWER"]

# -----------------------------
# TRAIN / TEST SPLIT
# -----------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42
)

print("Training samples:", X_train.shape[0])
print("Testing samples:", X_test.shape[0])

# -----------------------------
# PIPELINE: IMPUTATION + MODEL
# -----------------------------
pipeline = Pipeline(steps=[
    ("imputer", SimpleImputer(strategy="mean")),
    ("model", LinearRegression())
])

# -----------------------------
# TRAIN
# -----------------------------
pipeline.fit(X_train, y_train)

# -----------------------------
# PREDICT
# -----------------------------
y_pred = pipeline.predict(X_test)

# -----------------------------
# EVALUATION
# -----------------------------
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
r2 = r2_score(y_test, y_pred)

print("\n=== MODEL PERFORMANCE ===")
print(f"RMSE: {rmse:.2f}")
print(f"R² Score: {r2:.3f}")

# -----------------------------
# FEATURE COEFFICIENTS
# -----------------------------
coefficients = pipeline.named_steps["model"].coef_
coef_series = pd.Series(coefficients, index=features)

print("\n=== FEATURE COEFFICIENTS ===")
print(coef_series)
