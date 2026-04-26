const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const path = require("path");
const GEMINI_API_KEY = "api key here";

const app = express();
app.use(cors());
app.use(express.json());

// 📁 storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// 📤 upload route — forwards to Python AI service
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Build absolute path to the uploaded file
    const filePath = path.resolve(req.file.path);

    console.log(`📂 File uploaded: ${filePath}`);
    console.log(`🔄 Forwarding to Python AI service...`);

    // Call the Python Flask service at port 5001
    const pythonResponse = await axios.post("http://localhost:5001/analyze", {
      file_path: filePath,
    }, {
      timeout: 30000, // 30s timeout for large datasets
    });

    console.log(`✅ Analysis complete`);

    res.json({
      message: "File processed successfully",
      data: pythonResponse.data,
    });

  } catch (error) {
    console.error("❌ Analysis error:", error.message);

    if (error.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "Python AI service is not running. Start it with: cd ai-service && python app.py",
      });
    }

    res.status(500).json({
      error: error.response?.data?.error || error.message || "Server error",
    });
  }
});

// ✨ Gemini Summary Route
app.post("/summary", async (req, res) => {
  try {
    const { analysisData } = req.body;
    if (!analysisData) return res.status(400).json({ error: "No analysis data provided" });

    const simplifiedData = {
      overall_bias: analysisData.with_sensitive?.summary?.overall_bias,
      overall_bias_score: analysisData.with_sensitive?.summary?.overall_bias_score,
      mitigation_impact: analysisData.without_sensitive?.summary?.mitigation_impact,
      top_biased_features: Object.entries(analysisData.with_sensitive?.bias_report || {})
        .sort(([, a], [, b]) => (b.bias_score || 0) - (a.bias_score || 0))
        .slice(0, 3)
        .map(([key, val]) => ({ feature: key, score: val.bias_score, insight: val.insight })),
      privacy_insight: analysisData.privacy_insight
    };

    const prompt = `
      You are an AI Fairness Expert. Analyze the following bias detection report and provide a comprehensive, professional, and easy-to-understand summary.
      
      REPORT DATA:
      ${JSON.stringify(simplifiedData, null, 2)}
      
      Please include:
      1. An executive summary of the overall fairness of the dataset.
      2. A breakdown of the most significant biases found.
      3. An explanation of how the mitigation strategy improved the model.
      4. Actionable recommendations for the data science team.
      
      Keep the tone professional yet encouraging. Use markdown formatting for better readability.
    `;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }]
      }
    );

    const generatedText = response.data.candidates[0].content.parts[0].text;
    res.json({ summary: generatedText });

  } catch (error) {
    console.error("❌ Gemini Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to generate AI summary" });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
  console.log("Make sure Python AI service is running on port 5001");
});
