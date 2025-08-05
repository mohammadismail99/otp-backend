require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const axios = require("axios"); // ✅ Required for pinging

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// In-memory OTP store (you can use Redis or DB in production)
const otpStore = new Map();

// Configure nodemailer
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD, // Gmail app password, not your login
  },
});

// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Endpoint to send OTP
app.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  const otp = generateOtp();
  const expiresAt = Date.now() + 5 * 60 * 1000; // OTP valid for 5 mins
  otpStore.set(email, { otp, expiresAt });

  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: "🔐 Your OTP for Signup Verification",
    text: `Your OTP code is: ${otp}. It will expire in 5 minutes.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Email sending failed:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// Endpoint to verify OTP
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return res.status(400).json({ error: "Email and OTP are required" });

  const stored = otpStore.get(email);

  if (!stored)
    return res.status(400).json({ error: "No OTP sent to this email" });

  if (stored.expiresAt < Date.now()) {
    otpStore.delete(email);
    return res.status(400).json({ error: "OTP expired" });
  }

  if (stored.otp !== otp)
    return res.status(400).json({ error: "Invalid OTP" });

  otpStore.delete(email); // Clean up after successful verification
  res.json({ success: true });
});

// ✅ Keep firebase-listener awake every 10 minutes
setInterval(() => {
  axios.get("https://firebase-listener.onrender.com/")
    .then(() => console.log("🔁 Pinged firebase-listener"))
    .catch((err) => console.error("⚠️ Ping failed:", err.message));
}, 10 * 60 * 1000); // 10 minutes

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
