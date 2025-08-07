require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const axios = require("axios");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// In-memory OTP store
const otpStore = new Map();

// 🔐 Initialize Firebase Admin
const serviceAccount = require("./oil-change-830cf-461c11caa9af.json");
 // Replace with your path
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ✉️ Configure nodemailer
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

// 🔢 Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 📤 Send OTP
app.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const otp = generateOtp();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    otpStore.set(email, { otp, expiresAt });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "🔐 Your OTP for Password Reset",
      text: `Your OTP is: ${otp}. It will expire in 5 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error sending OTP:", err.message);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// ✅ Verify OTP and update Firebase password
app.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

    const stored = otpStore.get(email);
    if (!stored) return res.status(400).json({ error: "No OTP sent to this email" });
    if (stored.expiresAt < Date.now()) {
      otpStore.delete(email);
      return res.status(400).json({ error: "OTP expired" });
    }
    if (stored.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });

    // ✅ OTP is valid
    otpStore.delete(email);

    // 🔁 Get user and update password
    const userRecord = await admin.auth().getUserByEmail(email);

    await admin.auth().updateUser(userRecord.uid, {
      password: "T3mp@123!", // You can change this password
    });

    res.json({ success: true, message: "OTP verified. Password has been reset to temporary password. Please login and change it." });
  } catch (err) {
    console.error("❌ OTP verification error:", err.message);
    res.status(500).json({ error: "OTP verification failed" });
  }
});

// 🌐 Keep-alive ping
setInterval(() => {
  axios.get("https://firebase-listener.onrender.com/")
    .then(() => console.log("🔁 Pinged firebase-listener"))
    .catch((err) => console.error("⚠️ Ping failed:", err.message));
}, 10 * 60 * 1000);

// 🚦 Health check
app.get("/ping", (req, res) => {
  res.json({ message: "OTP Server is awake" });
});

// 🚀 Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
