import pandas as pd

# 🔥 Define sensitive columns
SENSITIVE_COLS = ["gender", "caste", "age", "race", "ethnicity", "religion"]


# ─────────────────────────────────────────────────────────────────────────────
# FAIRNESS CALCULATION METRICS
# ─────────────────────────────────────────────────────────────────────────────
def demographic_parity(df, pred, col):
    try:
        df = df.copy()
        df["prediction"] = pred
        rates = df.groupby(col)["prediction"].mean()
        return float(rates.max() - rates.min())
    except:
        return 0


def equal_opportunity(df, pred, col):
    try:
        df = df.copy()
        df["prediction"] = pred

        # Try to find target in df or assume median split target was used
        target_col = "target" if "target" in df.columns else None
        if not target_col:
            return 0

        subset = df[df[target_col] == 1]
        if subset.empty:
            return 0

        rates = subset.groupby(col)["prediction"].mean()
        return float(rates.max() - rates.min())
    except:
        return 0


def disparate_impact(df, pred, col):
    try:
        df = df.copy()
        df["prediction"] = pred
        rates = df.groupby(col)["prediction"].mean()
        return float(rates.min() / (rates.max() + 1e-6))
    except:
        return 1.0


# ==============================
# CATEGORICAL COLUMNS
# ==============================
def get_categorical_columns(df):
    """Identify columns suitable for bias auditing."""
    exclude_cols = ["prediction", "target", "date", "time", "id", "userid"]
    candidates = []
    for col in df.columns:
        col_lower = col.lower()
        # Skip excluded patterns
        if any(ex in col_lower for ex in exclude_cols):
            continue
        
        # Suitable for auditing if it's categorical-like
        n_unique = df[col].nunique()
        if 1 < n_unique <= 30: # Increased limit to 30 for more "random" CSVs
            candidates.append(col)
    return candidates


# ==============================
# LABELS / TYPES
# ==============================
def get_bias_type(col):
    col_lower = col.lower()
    for s in SENSITIVE_COLS:
        if s in col_lower:
            return "Sensitive Bias"
    return "General Pattern"


def get_severity(score):
    if score < 0.1:
        return "Low"
    elif score < 0.3:
        return "Medium"
    return "High"


def bias_label(score):
    if score < 0.1:
        return "Fair"
    elif score < 0.2:
        return "Moderate"
    return "Highly Biased"


def get_bias_insight(feature, group_rates, bias_score):
    if not group_rates or bias_score == 0:
        return f"No significant bias detected in '{feature}'"

    try:
        max_group = max(group_rates, key=group_rates.get)
        min_group = min(group_rates, key=group_rates.get)
        return f"{feature} is biased: '{max_group}' is favored over '{min_group}'"
    except:
        return f"Bias detected in {feature}"


# ==============================
# MAIN BIAS FUNCTION
# ==============================
def detect_bias_all_columns(df, predictions):
    df = df.copy()
    df["prediction"] = predictions

    categorical_cols = get_categorical_columns(df)
    bias_report = {}

    for col in categorical_cols:
        try:
            groups = df[col].dropna().unique()

            if len(groups) < 2:
                continue

            group_rates = {}

            for group in groups:
                group_data = df[df[col] == group]
                if len(group_data) == 0:
                    continue

                # Support binary predictions or continuous if they were passed
                pred_vals = group_data["prediction"]
                positive_rate = pred_vals.mean() if pd.api.types.is_numeric_dtype(pred_vals) else (pred_vals == pred_vals.mode()[0]).mean()
                
                group_rates[str(group)] = round(float(positive_rate), 3)

            values = list(group_rates.values())
            if len(values) < 2:
                continue

            bias_score = round(max(values) - min(values), 3)

            # 🔥 FAIRNESS METRICS
            dp = demographic_parity(df, df["prediction"], col)
            eo = equal_opportunity(df, df["prediction"], col)
            di = disparate_impact(df, df["prediction"], col)

            bias_report[col] = {
                "group_rates": group_rates,
                "bias_score": bias_score,
                "label": bias_label(bias_score),
                "insight": get_bias_insight(col, group_rates, bias_score),
                "demographic_parity": round(dp, 3),
                "equal_opportunity": round(eo, 3),
                "disparate_impact": round(di, 3),
                "type": get_bias_type(col),
                "severity": get_severity(bias_score)
            }
        except:
            continue

    return bias_report


def most_biased_feature(bias_report):
    if not bias_report:
        return None, 0
    max_bias = 0
    worst_feature = None

    for feature, data in bias_report.items():
        if data["bias_score"] > max_bias:
            max_bias = data["bias_score"]
            worst_feature = feature

    return worst_feature, round(max_bias, 3)