import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INSTRUCTIONS = [
  "You are the host standing at the foot of the shyft mark in the hall in Tyrol.",
  "shyft studio builds AI systems for hotels and tourism.",
  "Speak English. Use one or two short spoken sentences at a time.",
  "Sound calm and direct. No slogans, no filler, and no lists unless asked.",
  "The work is AI systems for the work behind a stay. It is for hotels and tourism.",
  "A start is a fifteen-minute look, with no pitch. The address is hallo@shyftstudio.at.",
  "You are in the hall with the visitor, at the foot of the mark. The mark is shyft.",
  "If you do not know something, say so and offer the fifteen-minute look.",
  "Do not invent products, prices, clients, or metrics.",
].join(" ");

const MODELS = ["gpt-realtime-2.1", "gpt-realtime"];

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("OPENAI_API_KEY=")) continue;
      return line.slice("OPENAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    return "";
  }
  return "";
}

function allowedOrigin(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return host && url.port === "5181";
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100000) {
        reject(new Error("large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function openCall(key, sdp, model) {
  const session = JSON.stringify({
    type: "realtime",
    model,
    instructions: INSTRUCTIONS,
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: { type: "server_vad" },
      },
      output: { voice: "marin" },
    },
  });
  const body = new FormData();
  body.set("sdp", sdp);
  body.set("session", session);
  return fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "OpenAI-Safety-Identifier": "shyft-hall-local",
    },
    body,
  });
}

// The browser posts an SDP offer. The project key stays in this process.
export function voiceMiddleware() {
  const key = apiKey();
  return (req, res, next) => {
    const path = req.url?.split("?")[0];
    if (path !== "/api/voice") return next();
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    readBody(req)
      .then(async (sdp) => {
        if (!allowedOrigin(req.headers.origin)) {
          res.statusCode = 403;
          res.end("The voice line is local.");
          return;
        }
        if (!sdp.startsWith("v=0")) {
          res.statusCode = 400;
          res.end("The voice line failed.");
          return;
        }
        if (!key) {
          res.statusCode = 503;
          res.end("The voice line is not configured.");
          return;
        }
        let response = null;
        let answer = "";
        for (const model of MODELS) {
          response = await openCall(key, sdp, model);
          answer = await response.text();
          if (response.ok || response.status === 401) break;
          if (!/model/i.test(answer)) break;
        }
        if (!response.ok || answer.includes("sk-")) {
          console.error("voice session failed", response.status);
          res.statusCode = response.status === 401 ? 401 : 502;
          res.end("The voice line failed.");
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/sdp");
        res.end(answer);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "read";
        console.error("voice session failed", message.includes("sk-") ? "read" : message);
        if (!res.headersSent) {
          res.statusCode = 400;
          res.end("The voice line failed.");
        }
      });
  };
}
