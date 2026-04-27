from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
import os
import traceback

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.preprocessing import StandardScaler

from bias import detect_bias_all_columns, most_biased_feature, get_categorical_columns
from scipy.stats import chi2_contingency

from flask_cors import CORS


app = Flask(__name__)
CORS(app)

PII_COLUMNS = ["name", "email", "phone", "aadhaar", "id", "userid", "address", "ssn", "passport", "ip"]
SENSITIVE_KEYWORDS = ["gender", "sex", "race", "ethnicity", "age", "caste", "religion", "nationality", "disability"]

# ==============================
# HELPERS
# ==============================

def prepare_agnostic_df(df):
    df = df.copy()
    to_drop = [c for c in df.columns if any(p in c.lower() for p in PII_COLUMNS)]
    # Drop columns where every row is unique (likely IDs)
    for col in df.columns:
        if col not in to_drop and not pd.api.types.is_numeric_dtype(df[col]):
            if df[col].nunique() >= 0.95 * len(df) and len(df) > 5:
                to_drop.append(col)
    
    df = df.drop(columns=to_drop, errors="ignore")
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            df[col] = df[col].fillna(df[col].median() if not df[col].isna().all() else 0)
        else:
            df[col] = df[col].fillna("Unknown")
    return df

def get_best_target(df):
    keywords = ["target", "label", "class", "output", "y", "status", "result", "cases", "pred", "diagnosis"]
    for c in df.columns:
        if c.lower() in keywords: return c
    # Fallback to last column that isn't too "complex"
    for c in reversed(df.columns):
        if 1 < df[c].nunique() <= 50: return c
    return df.columns[-1]

def encode_for_training(df, target_col):
    X = df.drop(columns=[target_col])
    X_enc = pd.DataFrame(index=df.index)
    for col in X.columns:
        if pd.api.types.is_numeric_dtype(X[col]):
            X_enc[col] = X[col]
        elif X[col].nunique() <= 100:
            le = LabelEncoder()
            X_enc[col] = le.fit_transform(X[col].astype(str))
    return X_enc

def avg_bias_score(bias_report):
    if not bias_report: return 0
    return round(float(np.mean([v["bias_score"] for v in bias_report.values()])), 3)

def severity_label(score):
    if score > 0.3: return "High"
    if score > 0.1: return "Moderate"
    return "Low"

# ==============================
# AUDIT WRAPPER
# ==============================

def train_and_audit(clf, xt, yt, xte, yte, audit_df, weights=None):
    try:
        if weights is not None:
            clf.fit(xt, yt, sample_weight=weights)
        else:
            clf.fit(xt, yt)
        
        preds = clf.predict(xte)
        report = detect_bias_all_columns(audit_df, preds)
        worst, score = most_biased_feature(report)
        
        return {
            "bias_score": score,
            "avg_bias": avg_bias_score(report),
            "most_biased_feature": worst or "None",
            "performance": {"accuracy": round(float(accuracy_score(yte, preds)), 3)},
            "bias_report": report
        }
    except Exception as e:
        print(f"Error in train_and_audit: {e}")
        traceback.print_exc()
        return None

# ==============================
# API
# ==============================

@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files['file']
        df_raw = pd.read_csv(file)
        df = prepare_agnostic_df(df_raw)
        target_col = get_best_target(df)
        
        # Binary split for high-cardinality targets
        y = df[target_col]
        if y.nunique() > 10:
            if pd.api.types.is_numeric_dtype(y):
                y = (y > y.median()).astype(int)
            else:
                le_y = LabelEncoder()
                y_e = le_y.fit_transform(y.astype(str))
                y = (y_e > np.median(y_e)).astype(int)
        else:
            # Ensure target is encoded if categorical
            if not pd.api.types.is_numeric_dtype(y):
                le_y = LabelEncoder()
                y = le_y.fit_transform(y.astype(str))

        X = encode_for_training(df, target_col)
        if X.empty: return jsonify({"error": "No features found"}), 400

        X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
            X, y, df.index, test_size=0.2, random_state=42
        )
        audit_test = df.loc[idx_test]

        # Scale data for better convergence
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        # 1. BASELINE
        res_lr = train_and_audit(LogisticRegression(max_iter=5000), X_train_scaled, y_train, X_test_scaled, y_test, audit_test)
        if not res_lr: return jsonify({"error": "Baseline model training failed"}), 500
        
        # 2. MITIGATE - Strategy A: Reweighting
        # Mitigate all columns with bias > 0.1
        bad_cols = [c for c, r in res_lr["bias_report"].items() if r["bias_score"] > 0.1]
        weights = np.ones(len(y_train))
        if bad_cols:
            for c in bad_cols:
                if c in df.columns:
                    counts = df.loc[idx_train, c].value_counts(normalize=True).to_dict()
                    weights *= np.array([1.0 / (counts.get(v, 1.0) + 1e-6) for v in df.loc[idx_train, c]])
            weights = np.clip(weights / weights.mean(), 0.1, 10.0)
        
        res_mit = train_and_audit(LogisticRegression(max_iter=5000), X_train_scaled, y_train, X_test_scaled, y_test, audit_test, weights=weights)
        
        # 3. MITIGATE - Strategy B: Retraining (Dropping bad features)
        X_ns = X.drop(columns=bad_cols, errors="ignore")
        if not X_ns.empty:
            X_tr_ns, X_te_ns, y_tr_ns, y_te_ns = train_test_split(X_ns, y, test_size=0.2, random_state=42)
            res_ret = train_and_audit(RandomForestClassifier(n_estimators=50), X_tr_ns, y_tr_ns, X_te_ns, y_te_ns, audit_test)
        else:
            res_ret = None
            
        # Final selection
        lr_avg = res_lr["avg_bias"]
        mit_avg = res_mit["avg_bias"] if res_mit else 1.0
        ret_avg = res_ret["avg_bias"] if res_ret else 1.0
        
        best_after = min(mit_avg, ret_avg)
        
        if res_mit and res_ret:
            if mit_avg <= ret_avg:
                best_report = res_mit["bias_report"]
                best_key = "Reweighting"
            else:
                best_report = res_ret["bias_report"]
                best_key = "Retraining"
        elif res_mit:
            best_report = res_mit["bias_report"]
            best_key = "Reweighting"
        elif res_ret:
            best_report = res_ret["bias_report"]
            best_key = "Retraining"
        else:
            best_report = res_lr["bias_report"]
            best_key = "Baseline (Mitigation Failed)"
        
        impact = f"{round(((lr_avg - best_after) / (lr_avg + 1e-6)) * 100)}%" if lr_avg > 0 else "0%"

        # Distributions
        data_bias = {}
        for col in get_categorical_columns(df)[:6]:
            counts = df[col].value_counts(normalize=True).to_dict()
            data_bias[col] = {str(k): round(float(v), 3) for k, v in counts.items()}

        return jsonify({
            "data_bias": data_bias,
            "with_sensitive": {
                "bias_report": res_lr["bias_report"],
                "summary": {
                    "overall_bias": severity_label(lr_avg),
                    "overall_bias_score": lr_avg,
                    "message": "Agnostic baseline complete.",
                    "reason": f"Top source: {res_lr['most_biased_feature']}"
                }
            },
            "without_sensitive": {
                "bias_report": best_report,
                "summary": {
                    "overall_bias": severity_label(best_after),
                    "overall_bias_score": best_after,
                    "message": f"Results after {best_key}",
                    "mitigation_impact": impact
                }
            },
            "models": {
                "logistic_regression": res_lr,
                "random_forest": train_and_audit(RandomForestClassifier(n_estimators=50), X_train, y_train, X_test, y_test, audit_test),
                "mitigated": res_mit or res_lr,
                "retrained": res_ret or res_lr
            },
            "privacy_insight": f"PII/IDs removed. {len(bad_cols)} features mitigated.",
            "proxy_bias": []
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
