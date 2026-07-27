import { GoogleGenAI } from '@google/genai';

let ai: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no está configurada en Vercel.');
    }

    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'total-look-vercel-function',
        },
      },
    });
  }

  return ai;
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 2000,
): Promise<T> {
  let attempt = 1;

  while (true) {
    try {
      return await fn();
    } catch (error: unknown) {
      const candidate = error as {
        message?: string;
        status?: number;
        statusCode?: number;
      };
      const message = candidate.message ?? '';
      const isQuotaError =
        candidate.status === 429 ||
        candidate.statusCode === 429 ||
        message.includes('429') ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.toLowerCase().includes('too many requests') ||
        message.toLowerCase().includes('quota');

      if (!isQuotaError || attempt >= maxAttempts) {
        throw error;
      }

      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn('[gemini] Cuota excedida; reintentando', {
        attempt,
        maxAttempts,
        delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}

export function jsonError(error: unknown): Response {
  const message =
    error instanceof Error ? error.message : 'Error al procesar la imagen';

  console.error('[gemini] La función falló', {
    message,
    stack: error instanceof Error ? error.stack : undefined,
  });

  return Response.json({ error: message }, { status: 500 });
}

interface Base64Image {
  data: string;
  mimeType: string;
}

export async function readBase64Image(request: Request): Promise<Base64Image> {
  const body = (await request.json()) as { base64Image?: unknown };

  if (typeof body.base64Image !== 'string' || !body.base64Image.trim()) {
    throw new InvalidRequestError('Falta la imagen');
  }

  const image = body.base64Image.trim();
  const dataUrlMatch = image.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/,
  );
  const mimeType = dataUrlMatch?.[1] ?? 'image/jpeg';
  const data = (dataUrlMatch?.[2] ?? image).replace(/\s/g, '');

  if (
    data.length < 100 ||
    data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
    Buffer.from(data, 'base64').byteLength < 64
  ) {
    throw new InvalidRequestError(
      'La foto llegó vacía. Espera a que la cámara esté lista e intenta de nuevo.',
    );
  }

  return { data, mimeType };
}

export class InvalidRequestError extends Error {}
