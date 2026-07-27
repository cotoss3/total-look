import {
  executeWithRetry,
  getGeminiClient,
  InvalidRequestError,
  jsonError,
  readBase64Image,
} from './_shared';

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

      const studioImage = await executeWithRetry(async () => {
        const response = await getGeminiClient().models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: cleanBase64,
                },
              },
              {
                text: 'Please remove the background of this product completely and replace it with an absolute pure white background (hex #FFFFFF). Scale and center the product so that its elements span exactly 95% of the total width of the image, leaving a very small and clean 2.5% margin on the left and right. Remove all shadows. Enhance the product details and clarity for a professional e-commerce catalog look. Ensure bright, even lighting across the entire product. Output ONLY the resulting image without any text or additional elements.',
              },
            ],
          },
        });

        const parts = response.candidates?.[0]?.content?.parts;
        if (!parts) {
          throw new Error('No se pudo generar la imagen de estudio.');
        }

        for (const part of parts) {
          if (part.inlineData?.data) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }

        throw new Error('La IA no devolvió una imagen procesada.');
      });

      return Response.json({ studioImage });
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

