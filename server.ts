import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Load environment variables from .env.local or .env if present
for (const file of [".env.local", ".env"]) {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...values] = trimmed.split("=");
        const val = values.join("=").trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper to lazily initialize Gemini client
  let ai: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required");
      }
      ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return ai;
  }

  // Helper that executes with exponential backoff for 429 Rate Limits / Quotas
  async function executeWithRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 4,
    baseDelayMs = 2000
  ): Promise<T> {
    let attempt = 1;
    while (true) {
      try {
        return await fn();
      } catch (error: any) {
        const errorMsg = error.message || '';
        const is429 = 
          error.status === 429 ||
          error.statusCode === 429 ||
          errorMsg.includes('429') ||
          errorMsg.includes('RESOURCE_EXHAUSTED') ||
          errorMsg.toLowerCase().includes('too many requests') ||
          errorMsg.toLowerCase().includes('quota');

        if (is429 && attempt < maxAttempts) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.warn(`[429 Quota Exceeded] Retrying attempt ${attempt}/${maxAttempts} in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt++;
        } else {
          throw error;
        }
      }
    }
  }

  // API endpoints FIRST
  app.post("/api/gemini/extract-upc", async (req, res) => {
    try {
      const { base64Image } = req.body;
      if (!base64Image) {
        return res.status(400).json({ error: "Falta la imagen" });
      }

      if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY no está configurada en las variables de entorno del servidor.");
        return res.status(500).json({ error: "La API Key de Gemini no está configurada en el servidor. Por favor, asegúrese de agregarla en Settings > Secrets." });
      }

      const model = 'gemini-3.5-flash';
      const cleanBase64 = base64Image.split(',')[1] || base64Image;

      const result = await executeWithRetry(async () => {
        const client = getGeminiClient();
        const response = await client.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: cleanBase64,
                },
              },
              {
                text: "Extract the barcode UPC number (numeric string) from this image. Only return the digits of the code. If multiple codes are found, return the most prominent one. If no code is found, reply with 'NOT_FOUND'.",
              },
            ],
          },
        });

        const textOutput = response.text?.trim() || 'NOT_FOUND';
        if (textOutput === 'NOT_FOUND') {
          throw new Error("No se detectó el código UPC. Intenta de nuevo o digítalo.");
        }
        return textOutput.replace(/[^0-9A-Z]/gi, '');
      });

      return res.json({ upc: result });
    } catch (error: any) {
      console.error("Error in extract-upc endpoint:", error);
      return res.status(500).json({ error: error.message || "Error al procesar la imagen" });
    }
  });

  app.post("/api/gemini/transform-studio-shot", async (req, res) => {
    try {
      const { base64Image } = req.body;
      if (!base64Image) {
        return res.status(400).json({ error: "Falta la imagen" });
      }

      if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY no está configurada en las variables de entorno del servidor.");
        return res.status(500).json({ error: "La API Key de Gemini no está configurada en el servidor. Por favor, asegúrese de agregarla en Settings > Secrets." });
      }

      const model = 'gemini-2.5-flash-image';
      const cleanBase64 = base64Image.split(',')[1] || base64Image;

      const resultUrl = await executeWithRetry(async () => {
        const client = getGeminiClient();
        const response = await client.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: cleanBase64,
                },
              },
              {
                text: "Please remove the background of this product completely and replace it with an absolute pure white background (hex #FFFFFF). Scale and center the product so that its elements span exactly 95% of the total width of the image, leaving a very small and clean 2.5% margin on the left and right. Remove all shadows. Enhance the product details and clarity for a professional e-commerce catalog look. Ensure bright, even lighting across the entire product. Output ONLY the resulting image without any text or additional elements.",
              },
            ],
          },
        });

        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
          throw new Error("No se pudo generar la imagen de estudio.");
        }

        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        throw new Error("La IA no devolvió una imagen procesada.");
      });

      return res.json({ studioImage: resultUrl });
    } catch (error: any) {
      console.error("Error in transform-studio-shot endpoint:", error);
      return res.status(500).json({ error: error.message || "Error al procesar la imagen" });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
