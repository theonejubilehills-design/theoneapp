const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// 1. HTTP Endpoint: Send WhatsApp OTP
exports.sendWhatsAppOTP = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).send("");
  }

  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "Missing phoneNumber" });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, "");
    
    // A. No whitelist restriction for OTP dispatch
    const isHardcodedAdmin = cleanPhone === "8341664756" || cleanPhone === "918341664756";

    // B. Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins validity

    // C. Write to secure Firestore collection
    await db.collection("whatsapp_otps").doc(cleanPhone).set({
      code: otpCode,
      expiresAt: expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // D. Dispatch Request to Meta WhatsApp Cloud API
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      console.error("[WhatsApp] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID env variables.");
      return res.status(500).json({ error: "Configuration error: missing API credentials" });
    }

    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`,
      type: "template",
      template: {
        name: "otp_login",
        language: {
          code: "en_US"
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: otpCode
              }
            ]
          }
        ]
      }
    };

    console.log(`[WhatsApp] Dispatching OTP to clean phone number: ${cleanPhone}`);
    const apiResponse = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("[WhatsApp] Meta API Response:", apiResponse.data);
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("[WhatsApp] Error sending OTP:", error.response ? error.response.data : error.message);
    return res.status(500).json({ error: error.message });
  }
});

// 2. HTTP Endpoint: Verify WhatsApp OTP
exports.verifyWhatsAppOTP = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).send("");
  }

  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ error: "Missing phoneNumber or code" });
    }

    const cleanPhone = phoneNumber.replace(/\D/g, "");



    // A. Verify against database
    const otpDocRef = db.collection("whatsapp_otps").doc(cleanPhone);
    const otpSnap = await otpDocRef.get();

    if (!otpSnap.exists) {
      return res.status(400).json({ error: "No active OTP session found" });
    }

    const otpData = otpSnap.data();
    if (otpData.code !== code) {
      return res.status(400).json({ error: "Invalid OTP code" });
    }

    if (Date.now() > otpData.expiresAt) {
      return res.status(400).json({ error: "OTP session has expired" });
    }

    // B. Clean up verified session
    await otpDocRef.delete();

    // C. Get or create user record
    const userUid = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUserByPhoneNumber(userUid);
    } catch (authError) {
      if (authError.code === "auth/user-not-found") {
        firebaseUser = await admin.auth().createUser({
          phoneNumber: userUid
        });
      } else {
        throw authError;
      }
    }

    // D. Return Firebase Custom Token
    const customToken = await admin.auth().createCustomToken(firebaseUser.uid);
    return res.status(200).json({ success: true, token: customToken });

  } catch (error) {
    console.error("[WhatsApp] Error verifying OTP:", error.message);
    return res.status(500).json({ error: error.message });
  }
});
