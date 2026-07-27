/**
 * Service to handle real Google Drive uploads and User profile.
 * Retains session token in memory and sessionStorage so login popup is only shown ONCE per session.
 */
const DRIVE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive';

export class DriveService {
  private readonly FOLDER_ID = (import.meta.env && import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID) || '1s45XARq_hD21G0OZLyMwrjNQzgeDfn6I';
  private accessToken: string | null = sessionStorage.getItem('google_drive_token');
  private tokenExpiresAt: number = parseInt(sessionStorage.getItem('google_drive_token_expires') || '0', 10);

  constructor() {
    // A token issued with drive.file cannot write inside a pre-existing
    // shared folder. Discard stale tokens so Google requests the new scope.
    if (sessionStorage.getItem('google_drive_token_scope') !== DRIVE_OAUTH_SCOPE) {
      this.logout();
    }
  }

  /**
   * Requests an access token from Google or reuses active retained token.
   */
  async getAccessToken(clientId: string): Promise<string> {
    const now = Date.now();
    // Reuse valid token (leaving 2 minutes safety margin before 1-hour expiry)
    if (this.accessToken && this.tokenExpiresAt > now + 120000) {
      return this.accessToken;
    }

    return new Promise((resolve, reject) => {
      try {
        if (!window.google) {
          reject(new Error("Google SDK no cargado. Revisa tu conexión a internet."));
          return;
        }

        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: `${DRIVE_OAUTH_SCOPE} https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email`,
          callback: (response: any) => {
            if (response.error) {
              reject(new Error(response.error_description || "Error de autenticación"));
              return;
            }
            const token = response.access_token;
            // Google OAuth tokens are valid for 3600 seconds (1 hour)
            const expiresInMs = response.expires_in ? parseInt(response.expires_in, 10) * 1000 : 3600 * 1000;
            const expiresAt = Date.now() + expiresInMs;

            this.accessToken = token;
            this.tokenExpiresAt = expiresAt;

            sessionStorage.setItem('google_drive_token', token);
            sessionStorage.setItem('google_drive_token_expires', expiresAt.toString());
            sessionStorage.setItem('google_drive_token_scope', DRIVE_OAUTH_SCOPE);

            resolve(token);
          },
        });
        client.requestAccessToken();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Fetches the user profile info from Google.
   */
  async getUserProfile(token: string) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error("No se pudo obtener el perfil de usuario");
    return await response.json();
  }

  /**
   * Creates a ALWAYS UNIQUE subfolder inside a parent folder in Google Drive.
   * If "Look 0001" exists, tries "Look 0001.1", "Look 0001.2", etc. so folders are NEVER repeated or overwritten.
   */
  async createUniqueFolder(baseFolderName: string, token: string, parentFolderId?: string): Promise<{ folderId: string; finalFolderName: string }> {
    const targetParent = parentFolderId || this.FOLDER_ID;

    let candidateName = baseFolderName.trim();
    let counter = 1;

    while (true) {
      try {
        const query = encodeURIComponent(`name = '${candidateName}' and '${targetParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.files && searchData.files.length > 0) {
            // Folder name already exists in Drive! Append .1, .2, etc. to guarantee a separate folder
            candidateName = `${baseFolderName.trim()}.${counter}`;
            counter++;
            continue;
          }
        }
      } catch (e) {
        console.warn("Error verificando carpetas existentes en Drive, reintentando...", e);
      }

      // Candidate name is unique and free! Create the new subfolder
      const metadata = {
        name: candidateName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [targetParent]
      };

      const response = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
          throw new Error("Sesión de Google expirada. Por favor, vuelve a hacer clic en Subir para renovar la sesión.");
        }
        if (response.status === 403 || response.status === 404) {
          this.logout();
          throw new Error("Google Drive no concedió permiso para crear archivos en la carpeta destino. Autoriza nuevamente el acceso completo a Drive.");
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Error al crear la carpeta ${candidateName} en Drive`);
      }

      const data = await response.json();
      return { folderId: data.id, finalFolderName: candidateName };
    }
  }

  /**
   * Uploads a base64 image to a specific Google Drive folder.
   */
  async uploadImage(base64Data: string, fileName: string, token: string, targetFolderId?: string): Promise<any> {
    try {
      const destinationFolder = targetFolderId || this.FOLDER_ID;
      const base64Content = base64Data.split(',')[1] || base64Data;
      const byteCharacters = atob(base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const metadata = {
        name: fileName,
        parents: [destinationFolder],
        description: 'Subido automáticamente vía Total Look Studio AI',
        mimeType: 'image/jpeg',
      };

      const formData = new FormData();
      formData.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      formData.append('file', blob);

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
          throw new Error("Sesión expirada. Por favor, intenta de nuevo.");
        }
        if (response.status === 403 || response.status === 404) {
          this.logout();
          throw new Error("Google Drive no concedió permiso para guardar en la carpeta destino. Autoriza nuevamente el acceso completo a Drive.");
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Error al subir a Drive');
      }

      return await response.json();
    } catch (error: any) {
      throw new Error(error.message || "Error de red al conectar con Drive");
    }
  }

  /**
   * Uploads a batch directly into the configured Total_Look folder.
   * Each filename contains the UPC, Look code, and item index.
   */
  async uploadBatch(
    folderName: string,
    items: { upcCode: string; productImage: string; fileName: string }[],
    token: string,
    onProgress?: (current: number, total: number, folderName: string) => void
  ): Promise<{ folderId: string; finalFolderName: string }> {
    const folderId = this.FOLDER_ID;
    const finalFolderName = folderName.trim();
    const lookSlug = finalFolderName.replace(/\s+/g, '_');

    // Upload every coded file directly to the configured parent folder.
    for (let i = 0; i < items.length; i++) {
      if (onProgress) {
        onProgress(i + 1, items.length, finalFolderName);
      }
      const finalFileName = `${items[i].upcCode}_${lookSlug}_${i + 1}.jpg`;
      await this.uploadImage(items[i].productImage, finalFileName, token, folderId);
    }

    return { folderId, finalFolderName };
  }

  logout() {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    sessionStorage.removeItem('google_drive_token');
    sessionStorage.removeItem('google_drive_token_expires');
    sessionStorage.removeItem('google_drive_token_scope');
  }
}

export const driveService = new DriveService();

declare global {
  interface Window {
    google: any;
  }
}
