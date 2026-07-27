import {
  executeWithRetry,
  getGeminiClient,
  InvalidRequestError,
  jsonError,
  readBase64Image,
} from './_shared.js';

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Método no permitido' },
        { status: 405, headers: { Allow: 'POST' } },
      );
    }

    try {
      const base64Image = await readBase64Image(request);
      const cleanBase64 = base64Image.split(',')[1] || base64Image;

      const upc = await executeWithRetry(async () => {
        const response = await getGeminiClient().models.generateContent({
          model: 'gemini-3.5-flash',
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

        const result = response.text?.trim() || 'NOT_FOUND';
        if (result === 'NOT_FOUND') {
          throw new Error(
            'No se detectó el código UPC. Intenta de nuevo o digítalo.',
          );
        }

        return result.replace(/[^0-9A-Z]/gi, '');
      });

      return Response.json({ upc });
    } catch (error: unknown) {
      if (
        error instanceof InvalidRequestError ||
        error instanceof SyntaxError
      ) {
        return Response.json(
          {
            error:
              error instanceof SyntaxError
                ? 'El cuerpo de la solicitud no es JSON válido'
                : error.message,
          },
          { status: 400 },
        );
      }

      return jsonError(error);
    }
  },
};
