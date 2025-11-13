import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import OpenAI from "openai";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
if (!HEYGEN_API_KEY) {
  console.warn(
    "⚠️ HEYGEN_API_KEY is not set – /api/heygen-token will fail until you add it to .env"
  );
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// POST /api/client-secret – issues short-lived client secret for Realtime
app.post("/api/realtime-token", async (req, res) => {
  try {
    const { role, tone, difficulty } = req.body ?? {};

    // This endpoint name & payload shape follow the Realtime docs.
    const secret = await openai.realtime.clientSecrets.create({
      // Give the session config: model & instructions
      session: {
        type: "realtime",
        model: "gpt-realtime",
        // You can include instructions and tools here
        instructions: ` You are an AI job interviewer speaking with a candidate.
- Role: ${role || "Software Engineer"}
- Tone: ${tone || "professional and friendly"}
- Difficulty: ${difficulty || "medium"}

Rules:
- Ask one question at a time.
- Wait until the candidate seems finished before asking the next.
- Keep questions concise but thoughtful.
- If the candidate is silent for several seconds, gently prompt them.
- Speak clearly at a natural pace.`.trim(),
      },
      // short lifetime is safer for a PoC
      expires_after: {
        anchor: "created_at",
        seconds: 600,
      },
    });

    res.json({ ephemeralKey: secret.value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create client secret" });
  }
});

// POST /api/heygen-token – creates a HeyGen streaming session token
app.post("/api/heygen-token", async (_req, res) => {
  try {
    if (!HEYGEN_API_KEY) {
      return res
        .status(500)
        .json({ error: "HEYGEN_API_KEY is not configured on the server" });
    }

    const response = await fetch(
      "https://api.heygen.com/v1/streaming.create_token",
      {
        method: "POST",
        headers: {
          "x-api-key": HEYGEN_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("HeyGen create_token error:", text);
      return res
        .status(500)
        .json({ error: "Failed to create HeyGen session token" });
    }

    const { data } = (await response.json()) as { data?: { token?: string } };

    if (!data?.token) {
      console.error("Unexpected HeyGen token response:", data);
      return res
        .status(500)
        .json({ error: "Invalid HeyGen token response from API" });
    }

    res.json({ token: data.token });
  } catch (err) {
    console.error("Error in /api/heygen-token:", err);
    res.status(500).json({ error: "Failed to create HeyGen token" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});