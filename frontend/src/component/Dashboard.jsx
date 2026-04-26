import { useState } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export default function Dashboard({ setUser }) {
  const [data, setData] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // ==============================
  // 🔥 SAFE FORMAT FUNCTION
  // ==============================
  const safeNum = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "0.00";
    return Number(val).toFixed(2);
  };

  // ==============================
  // 🔥 FAIRNESS METRICS
  // ==============================
  const getFairnessMetrics = (biasReport) => {
    if (!biasReport) return [];

    return Object.keys(biasReport).map((feature) => ({
      feature,
      dp: biasReport[feature]?.demographic_parity ?? 0,
      eo: biasReport[feature]?.equal_opportunity ?? 0,
      di: biasReport[feature]?.disparate_impact ?? 0,
    }));
  };

  // ==============================
  // 🔥 UPLOAD
  // ==============================
  const handleUpload = async () => {
    if (!file) return alert("Select file");

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await axios.post("http://localhost:5000/upload", formData);

      console.log("API RESPONSE:", res.data);

      if (res.data?.data) {
        setData(res.data.data);
      } else {
        alert(res.data.error || "Backend error");
      }
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };

  // ==============================
  // 🔥 CHART DATA (FIXED)
  // ==============================
  const getChartData = () => {
    const report = data?.models?.with_sensitive?.bias_report;
    if (!report) return [];

    return Object.keys(report).map((col) => ({
      category: col,
      value: report[col].bias_score,
    }));
  };

  const colors = ["#14b8a6", "#f97316", "#06b6d4", "#fb923c", "#0891b2"];

  // ==============================
  // 🔥 SAFE RENDER
  // ==============================
  if (!data) {
    return (
      <div className="p-10 text-center text-xl">
        Upload a dataset to see analysis
      </div>
    );
  }

  return (
    <div className="p-8">

      {/* UPLOAD */}
      <div className="mb-6">
        <input type="file" onChange={(e) => setFile(e.target.files[0])} />
        <button onClick={handleUpload} className="ml-4">
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {/* ============================== */}
      {/* 🔥 CHART FIXED */}
      {/* ============================== */}
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={getChartData()}>
            <XAxis dataKey="category" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value">
              {getChartData().map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ============================== */}
      {/* 🔥 FAIRNESS METRICS FIXED */}
      {/* ============================== */}
      <div className="mt-6">
        <h2 className="text-xl font-bold mb-4">Fairness Metrics</h2>

        {getFairnessMetrics(data?.models?.with_sensitive?.bias_report || {}).map(
          (item, i) => (
            <div key={i} className="mb-4 p-4 border rounded">

              <h3 className="font-semibold">{item.feature}</h3>

              <div>DP: {safeNum(item.dp)}</div>
              <div>EO: {safeNum(item.eo)}</div>
              <div>DI: {safeNum(item.di)}</div>

            </div>
          )
        )}
      </div>

      {/* ============================== */}
      {/* 🔥 PROXY FIXED */}
      {/* ============================== */}
      <div className="mt-6">
        <h2 className="text-xl font-bold mb-4">Proxy Bias</h2>

        {data?.proxy_bias?.length > 0 ? (
          data.proxy_bias.map((p, i) => (
            <div key={i}>
              {p.feature_1} ↔ {p.feature_2}
            </div>
          ))
        ) : (
          <p>No proxy bias</p>
        )}
      </div>

      {/* ============================== */}
      {/* 🔥 INSIGHT */}
      {/* ============================== */}
      <div className="mt-6">
        <h3 className="font-bold">Insight</h3>
        <p>{data?.models?.explanation || "No insights available."}</p>
      </div>

    </div>
  );
}