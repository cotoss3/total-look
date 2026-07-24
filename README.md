# Total Look Studio AI

**Total Look** es una solución profesional web (Mobile First) para la catalogación masiva de productos agrupados por Looks consecutivos, potenciada con **Google Gemini AI** (escaneo UPC y remoción/estudio de fondo) y **Google Drive API** (sincronización de carpetas acumulativas).

---

## 🌟 Características Principales

- 📸 **Escaneo de Código de Barras (UPC) con IA**: Identificación automática de códigos UPC mediante `gemini-3.5-flash`.
- 🖼️ **Estudio Fotográfico con IA**: Eliminación de fondo, encuadre a 1000x1000 px al 95% de escala sobre fondo blanco absoluto con `gemini-2.5-flash-image`.
- 🏷️ **Gestión por Total Look Consecutivo**: Agrupamiento de productos por `Look 0001`, `Look 0002`, etc.
- 📁 **Nomenclatura Oficial**: Formato de archivo `[UPC]_[LOOK_SLUG]_[INDEX].jpg` (ej. `750123456789_Look_0001_1.jpg`).
- 🔒 **Garantía de Carpetas Únicas en Google Drive**:
  - Creación automática de subcarpetas en Google Drive.
  - Generación de sufijos `.1`, `.2` si el nombre de carpeta existía previamente (cero duplicados idénticos y cero mezcla de productos).
- 🔑 **Retención de Sesión Google OAuth**: Autorización única con validez de 1 hora para subir múltiples Looks en 1 solo clic.
- 📱 **Diseño 100% Móvil y Responsivo**: Optimizado para teléfonos inteligentes en paleta turquesa claro suave.

---

## 🚀 Inicio Rápido Local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar la clave API de Gemini en `.env.local`:
   ```env
   GEMINI_API_KEY=tu_api_key_de_gemini_aqui
   ```

3. Iniciar el servidor local:
   ```bash
   npm run dev
   ```

4. Abrir en el navegador:
   `http://localhost:3000`

---

## 🛠️ Tecnologías

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Lucide React Icons.
- **Backend**: Node.js + Express + `@google/genai`.
- **Almacenamiento**: Google Drive API v3 (OAuth 2.0 Identity Services).
