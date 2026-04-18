from flask import Flask, request, jsonify
from bias import detect_bias_all_columns, most_biased_feature
import pandas as pd
import numpy as np

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

app = Flask(__name__)

# ==============================
# 📊 DATA BIAS
# ==============================
def detect_data_bias(df):
    data_bias = {}

    for col in df.columns:
        if df[col].nunique() <= 10:
            value_counts = df[col].value_counts(normalize=True)

            data_bias[col] = {
                str(k): round(float(v), 3)
                for k, v in value_counts.items()
            }

    return data_bias


# ==============================
# 📊 AVG BIAS
# ==============================
def calculate_avg_bias(bias_report):
    if not bias_report:
        return 0
    scores = [v["bias_score"] for v in bias_report.values()]
    return round(sum(scores) / len(scores), 3)


# ==============================
# 🔥 FAIRNESS WEIGHTS
# ==============================
def compute_sample_weights(df, sensitive_col, y_true):
    df = df.copy()
    df["target"] = y_true.values if hasattr(y_true, 'values') else y_true

    group_counts = df[sensitive_col].value_counts(normalize=True)

    weights = []
    for _, row in df.iterrows():
        group = row[sensitive_col]
        weight = 1 / (group_counts[group] + 0.01)
        weights.append(weight)

    return weights


# ==============================
# 🧠 SUMMARY GENERATOR
# ==============================
def generate_summary(bias_report, avg_before, avg_after):
    if avg_after > 0.6:
        overall = "High ⚠️"
    elif avg_after > 0.3:
        overall = "Moderate ⚠️"
    else:
        overall = "Low ✅"

    if avg_after < avg_before:
        impact = "Effective ✅"
    else:
        impact = "Limited ⚠️"

    strong_features = []
    for feature, data in bias_report.items():
        if data["bias_score"] > 0.7:
            strong_features.append(feature)

    if strong_features:
        reason = f"Strong bias from features: {', '.join(strong_features)}"
        message = f"Model shows bias due to strong correlations in features like {', '.join(strong_features[:2])}"
    else:
        reason = "No strong proxy features detected"
        message = "Model bias is relatively controlled"

    return {
        "overall_bias": overall,
        "mitigation_impact": impact,
        "reason": reason,
        "message": message
    }


# ==============================
# 🔧 PREPARE DATA (shared helper)
# ==============================
def prepare_data(df_model, audit_df):
    target_column = df_model.columns[-1]

    X = df_model.drop(columns=[target_column]).copy()
    y = df_model[target_column].copy()

    # encoding
    for col in X.columns:
        X[col] = X[col].astype(str).str.strip()
        X[col] = pd.factorize(X[col])[0]

    X = X.apply(pd.to_numeric, errors='coerce').fillna(0)
    y = pd.to_numeric(y, errors='coerce').fillna(0).astype(int)

    # split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42
    )

    audit_test = audit_df.iloc[y_test.index]
    audit_train = audit_df.iloc[y_train.index]

    return X_train, X_test, y_train, y_test, audit_train, audit_test


# ==============================
# 🤖 RUN ALL 4 MODELS
# ==============================
def run_all_models(df_model, audit_df, sensitive_cols):
    X_train, X_test, y_train, y_test, audit_train, audit_test = prepare_data(df_model, audit_df)

    results = {}

    # ────────────────────────────────────────────────
    # 1️⃣ LOGISTIC REGRESSION (standard, no tricks)
    # ────────────────────────────────────────────────
    lr_model = LogisticRegression(max_iter=500, C=1.0)
    lr_model.fit(X_train, y_train)
    lr_pred = lr_model.predict(X_test)
    lr_bias = detect_bias_all_columns(audit_test, lr_pred)
    lr_avg = calculate_avg_bias(lr_bias)
    lr_top, _ = most_biased_feature(lr_bias)

    results["logistic_regression"] = {
        "bias_report": lr_bias,
        "avg_bias": lr_avg,
        "most_biased_feature": lr_top,
        "summary": generate_summary(lr_bias, lr_avg, lr_avg)
    }

    # ────────────────────────────────────────────────
    # 2️⃣ RANDOM FOREST (standard)
    # ────────────────────────────────────────────────
    rf_model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=5)
    rf_model.fit(X_train, y_train)
    rf_pred = rf_model.predict(X_test)
    rf_bias = detect_bias_all_columns(audit_test, rf_pred)
    rf_avg = calculate_avg_bias(rf_bias)
    rf_top, _ = most_biased_feature(rf_bias)

    results["random_forest"] = {
        "bias_report": rf_bias,
        "avg_bias": rf_avg,
        "most_biased_feature": rf_top,
        "summary": generate_summary(rf_bias, rf_avg, rf_avg)
    }

    # ────────────────────────────────────────────────
    # 3️⃣ MITIGATED MODEL (remove sensitive columns)
    # ────────────────────────────────────────────────
    drop_cols = [c for c in sensitive_cols if c in df_model.columns]
    df_mitigated = df_model.drop(columns=drop_cols, errors="ignore")
    X_m_train, X_m_test, y_m_train, y_m_test, _, audit_m_test = prepare_data(df_mitigated, audit_df)

    mit_model = LogisticRegression(max_iter=500, C=1.0)
    mit_model.fit(X_m_train, y_m_train)
    mit_pred = mit_model.predict(X_m_test)
    mit_bias = detect_bias_all_columns(audit_m_test, mit_pred)
    mit_avg = calculate_avg_bias(mit_bias)
    mit_top, _ = most_biased_feature(mit_bias)

    results["mitigated"] = {
        "bias_report": mit_bias,
        "avg_bias": mit_avg,
        "most_biased_feature": mit_top,
        "summary": generate_summary(mit_bias, lr_avg, mit_avg)  # compare to LR baseline
    }

    # ────────────────────────────────────────────────
    # 4️⃣ RETRAINED MODEL (sample-weight fairness)
    # ────────────────────────────────────────────────
    # Find the most-biased sensitive column from the LR baseline
    sensitive_in_data = [c for c in sensitive_cols if c in audit_train.columns]
    best_sensitive = None

    if sensitive_in_data:
        best_sensitive = sensitive_in_data[0]
        # pick the sensitive col with highest bias in the LR report
        for sc in sensitive_in_data:
            if sc in lr_bias and (best_sensitive not in lr_bias or lr_bias.get(sc, {}).get("bias_score", 0) > lr_bias.get(best_sensitive, {}).get("bias_score", 0)):
                best_sensitive = sc

    if best_sensitive and best_sensitive in audit_train.columns:
        weights = compute_sample_weights(audit_train, best_sensitive, y_train)
    else:
        # fallback: find any categorical column with >= 2 groups
        for col in audit_train.columns:
            if audit_train[col].nunique() >= 2 and audit_train[col].nunique() <= 10:
                weights = compute_sample_weights(audit_train, col, y_train)
                best_sensitive = col
                break
        else:
            weights = [1] * len(y_train)

    retrained_model = LogisticRegression(max_iter=500, C=1.0)
    retrained_model.fit(X_train, y_train, sample_weight=weights)
    ret_pred = retrained_model.predict(X_test)
    ret_bias = detect_bias_all_columns(audit_test, ret_pred)
    ret_avg = calculate_avg_bias(ret_bias)
    ret_top, _ = most_biased_feature(ret_bias)

    optimization_desc = f"Weighted on {best_sensitive}" if best_sensitive else "Equal weighting"

    results["retrained"] = {
        "bias_report": ret_bias,
        "avg_bias": ret_avg,
        "most_biased_feature": ret_top,
        "optimization": optimization_desc,
        "summary": generate_summary(ret_bias, lr_avg, ret_avg)
    }

    return results


# ==============================
# 🚀 MAIN API
# ==============================
@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.json
    file_path = data.get("file_path")

    try:
        df = pd.read_csv(file_path)
        df = df.dropna()

        # remove PII
        pii_cols = ["name", "email", "aadhaar", "phone"]
        df = df.drop(columns=[col for col in pii_cols if col in df.columns], errors="ignore")

        # Auto-detect sensitive columns present in the actual data
        possible_sensitive = ["gender", "age", "caste", "race", "ethnicity", "sex", "religion"]
        sensitive_cols = [c for c in possible_sensitive if c.lower() in [col.lower() for col in df.columns]]
        # Map to actual column names (preserving case)
        sensitive_cols = [col for col in df.columns if col.lower() in [s.lower() for s in possible_sensitive]]

        audit_df = df.copy()

        data_bias_report = detect_data_bias(audit_df)

        # Run all 4 models
        model_results = run_all_models(df, audit_df, sensitive_cols)

        # Privacy insight
        lr_avg = model_results["logistic_regression"]["avg_bias"]
        mit_avg = model_results["mitigated"]["avg_bias"]
        if mit_avg < lr_avg:
            privacy_insight = "Removing sensitive features reduced bias"
        else:
            privacy_insight = "Bias still exists due to proxy features"

        return jsonify({
            "data_bias": data_bias_report,
            "models": model_results,
            "privacy_insight": privacy_insight,
            # Keep backward compat keys
            "with_sensitive": model_results["logistic_regression"],
            "without_sensitive": model_results["mitigated"],
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)})


if __name__ == "__main__":
    app.run(port=5001, debug=True)