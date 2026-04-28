require("dotenv").config();
const express = require("express");

const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");

// Configuration from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDQeGK8A9_VW9NN8nyKjuJpHpSNDStJvcM";
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "https://ai-service-1025621130719.asia-south1.run.app/analyze";
const PORT = process.env.PORT || 5000;


const app = express();
app.use(cors());
app.use(express.json());

// 📁 storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
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

    console.log(`📂 File uploaded locally: ${req.file.path}`);
    console.log(`🔄 Forwarding to Python AI service at ${AI_SERVICE_URL}...`);

    // Create FormData to forward the file
    const formData = new FormData();
    formData.append("file", fs.createReadStream(req.file.path));

    const pythonResponse = await axios.post(AI_SERVICE_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 120000, // 120s timeout for large datasets
    });

    console.log(`✅ Analysis complete`);

    // Clean up the local file after forwarding
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("❌ Error deleting temp file:", err);
    });

    res.json({
      message: "File processed successfully",
      data: pythonResponse.data,
    });

  } catch (error) {
    console.error("❌ Analysis error:", error.response?.data || error.message);

    if (error.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "AI service is not reachable. Check AI_SERVICE_URL.",
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

    console.log("🔑 GEMINI KEY USED:", GEMINI_API_KEY);
     
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }]
        
      }
      
    );


    const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      console.error("❌ Invalid Gemini response:", JSON.stringify(response.data));
      throw new Error("AI failed to generate a summary. Check API key and quota.");
    }

    res.json({ summary: generatedText });

  } catch (error) {
  console.error("❌ FULL GEMINI ERROR:");
  console.error(JSON.stringify(error.response?.data, null, 2));

  res.status(500).json({
    error: "Failed to generate AI summary",
    full_error: error.response?.data || error.message
  });
}
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`AI Service URL: ${AI_SERVICE_URL}`);
});

