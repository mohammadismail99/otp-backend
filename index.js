require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const axios = require("axios");
const SibApiV3Sdk = require("sib-api-v3-sdk");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// In-memory OTP store (consider Redis/DB in production)
const otpStore = new Map();

// 🔑 Configure Brevo API
const defaultClient = SibApiV3Sdk.ApiClient.instance;
let apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;
const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Endpoint to send OTP
app.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const otp = generateOtp();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    otpStore.set(email, { otp, expiresAt });

    const sender = { email: "car00ilchange@gmail.com", name: "CarOil App" }; // must be verified in Brevo
    const receivers = [{ email }];

    try {
      await tranEmailApi.sendTransacEmail({
        sender,
        to: receivers,
        subject: "🔐 Your OTP for Signup Verification",
        textContent: `Your OTP code is: ${otp}. It will expire in 5 minutes.`,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("❌ Email sending failed:", err.message);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  } catch (err) {
    console.error("❌ Unexpected error in /send-otp:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to verify OTP
app.post("/verify-otp", (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const stored = otpStore.get(email);

    if (!stored) {
      return res.status(400).json({ error: "No OTP sent to this email" });
    }

    if (stored.expiresAt < Date.now()) {
      otpStore.delete(email);
      return res.status(400).json({ error: "OTP expired" });
    }

    if (stored.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    otpStore.delete(email); // Clean up after verification
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Unexpected error in /verify-otp:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Keep firebase-listener awake every 10 minutes
setInterval(() => {
  axios
    .get("https://firebase-listener.onrender.com/")
    .then(() => console.log("🔁 Pinged firebase-listener"))
    .catch((err) => console.error("⚠️ Ping failed:", err.message));
}, 10 * 60 * 1000);

// Health check endpoint
app.get("/ping", (req, res) => {
  try {
    res.json({ message: "OTP Server is awake" });
  } catch (err) {
    res.status(500).json({ error: "Ping failed" });
  }
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  try {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  } catch (err) {
    console.error("❌ Server failed to start:", err.message);
  }
});
