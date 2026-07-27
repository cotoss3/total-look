import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera as CameraIcon, RotateCw, AlertTriangle } from 'lucide-react';

interface CameraProps {
  onCapture: (base64Image: string) => void;
  label: string;
}

const Camera: React.FC<CameraProps> = ({ onCapture, label }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setIsReady(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false 
      });
      streamRef.current = newStream;
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        void videoRef.current.play().catch(() => {
          // Safari may defer playback until metadata is available.
        });
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setError("Permiso denegado o cámara no disponible. Por favor, asegúrate de otorgar permisos de cámara.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [startCamera]);

  const markCameraReady = () => {
    const video = videoRef.current;
    setIsReady(
      !!video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0,
    );
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (
        !isReady ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        setError("La cámara aún se está preparando. Espera un momento e intenta de nuevo.");
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length < 100) {
          setError("No se pudo capturar la foto. Presiona Reintentar cámara y vuelve a tomarla.");
          return;
        }

        onCapture(dataUrl);
      }
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto">
      <div 
        className="relative w-full aspect-[4/3] bg-brand-navy rounded-[2rem] overflow-hidden shadow-2xl shadow-black/50 border border-slate-800"
      >
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 p-10 text-center">
            <div className="bg-red-950/20 text-brand-gold p-6 rounded-3xl mb-4 border border-brand-gold/10 w-16 h-16 flex items-center justify-center animate-pulse">
              <AlertTriangle size={28} />
            </div>
            <p className="font-black text-rose-400 uppercase text-[10px] tracking-widest mb-1">Sin acceso a la cámara</p>
            <p className="text-slate-400 text-xs max-w-xs mb-8 leading-relaxed font-bold">{error}</p>
            
            <button 
              onClick={startCamera}
              className="px-6 py-4 bg-brand-navy hover:bg-slate-800 text-slate-200 border border-slate-800 font-bold text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg"
            >
              <RotateCw size={14} className="text-brand-gold" /> Reintentar cámara
            </button>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              onLoadedMetadata={markCameraReady}
              onCanPlay={markCameraReady}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4 right-4 text-center pointer-events-none flex justify-center">
              <span className="bg-brand-navy-light/95 text-slate-200 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur-md border border-brand-gold/20 shadow-lg">
                {label}
              </span>
            </div>
          </>
        )}
      </div>
      
      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-8 flex items-center justify-center gap-6 w-full">
        <button
          onClick={capturePhoto}
          disabled={!!error || !stream || !isReady}
          className="w-20 h-20 bg-brand-navy-light border-8 border-brand-gold/10 rounded-full flex items-center justify-center shadow-lg shadow-black/40 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
          title="Tomar Foto"
        >
          <div className="w-14 h-14 bg-brand-gold rounded-full flex items-center justify-center text-brand-navy shadow-md shadow-brand-gold/20 hover:scale-105 active:scale-95 transition-transform">
            <CameraIcon size={28} />
          </div>
        </button>
      </div>
    </div>
  );
};

export default Camera;
