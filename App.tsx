import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Barcode, 
  CheckCircle, 
  ArrowLeft, 
  Save, 
  Download, 
  Loader2, 
  AlertCircle,
  FileText,
  Cloud,
  Settings,
  ShieldCheck,
  LogOut,
  Copy,
  Info,
  Sparkles,
  Zap,
  Plus,
  Trash2,
  FolderPlus,
  Layers,
  Edit3,
  Check
} from 'lucide-react';
import { AppStep, AppState, User, LookItem } from './types';
import Camera from './components/Camera';
import { geminiService } from './services/geminiService';
import { driveService } from './services/driveService';
import { processAndResizeProductImage } from './services/imageProcessor';

const DEFAULT_CLIENT_ID = '627784858120-hi40re4hgr8p63a8p75recetb8ndo66t.apps.googleusercontent.com';

function formatLookNumber(num: number): string {
  return `Look ${String(num).padStart(4, '0')}`;
}

function parseLookNumber(str: string): number {
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const savedUser = localStorage.getItem('cataloger_user');
    const savedLookCount = localStorage.getItem('cataloger_look_count');
    const initialLookCount = savedLookCount ? parseInt(savedLookCount, 10) : 1;

    return {
      step: AppStep.LOOK_SUMMARY,
      lookNumber: formatLookNumber(initialLookCount),
      lookItems: [],
      upcCode: null,
      upcImage: null,
      productImage: null,
      isProcessing: false,
      processingMessage: '',
      error: null,
      user: savedUser ? JSON.parse(savedUser) : null
    };
  });

  const [clientId, setClientId] = useState<string>(DEFAULT_CLIENT_ID);
  const [showConfig, setShowConfig] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success'>('idle');
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [copied, setCopied] = useState(false);

  // Edit Look Number Modal state
  const [isEditingLook, setIsEditingLook] = useState(false);
  const [tempLookInput, setTempLookInput] = useState(state.lookNumber);

  useEffect(() => {
    if (clientId) {
      localStorage.setItem('google_drive_client_id', clientId);
    }
  }, [clientId]);

  const copyOrigin = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartNewItem = () => {
    setState(prev => ({
      ...prev,
      step: AppStep.SCAN_UPC,
      upcCode: null,
      upcImage: null,
      productImage: null,
      error: null
    }));
  };

  const handleCaptureUPC = async (image: string) => {
    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      error: null, 
      upcImage: image,
      processingMessage: 'IDENTIFICANDO CÓDIGO DE BARRAS...'
    }));
    try {
      const upc = await geminiService.extractUPC(image, (attempt, delayMs) => {
        setState(p => ({
          ...p,
          processingMessage: `LÍMITE EXCEDIDO. REINTENTANDO (${attempt}/3) EN ${Math.round(delayMs / 1000)}s...`
        }));
      });
      setState(prev => ({
        ...prev,
        upcCode: upc,
        step: AppStep.PRODUCT_PHOTO,
        isProcessing: false
      }));
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        error: err.message || "Error al leer el código UPC.",
        isProcessing: false
      }));
    }
  };

  const handleCaptureProduct = async (image: string) => {
    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      error: null,
      processingMessage: 'GENERANDO FOTO E-COMMERCE (FONDO BLANCO)...' 
    }));
    
    try {
      const studioImage = await geminiService.transformToStudioShot(image, (attempt, delayMs) => {
        setState(p => ({
          ...p,
          processingMessage: `LÍMITE EXCEDIDO. REINTENTANDO (${attempt}/3) EN ${Math.round(delayMs / 1000)}s...`
        }));
      });
      
      setState(prev => ({
        ...prev,
        processingMessage: 'ESCALANDO PRODUCTO AL 95% Y AJUSTANDO A 1000x1000 px...'
      }));

      const finalResizedImage = await processAndResizeProductImage(studioImage);

      setState(prev => ({
        ...prev,
        productImage: finalResizedImage,
        step: AppStep.REVIEW_ITEM,
        isProcessing: false
      }));
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        error: "Error en la IA del estudio: " + (err.message || "Reintenta."),
        isProcessing: false
      }));
    }
  };

  const handleConfirmAddItem = () => {
    if (!state.productImage || !state.upcCode) return;

    const nextIndex = state.lookItems.length + 1;
    const lookSlug = state.lookNumber.replace(/\s+/g, '_');
    const fileName = `${state.upcCode}_${lookSlug}_${nextIndex}.jpg`;

    const newItem: LookItem = {
      id: Date.now().toString(),
      upcCode: state.upcCode,
      productImage: state.productImage,
      itemIndex: nextIndex,
      fileName: fileName,
      createdAt: Date.now()
    };

    setState(prev => ({
      ...prev,
      lookItems: [...prev.lookItems, newItem],
      step: AppStep.LOOK_SUMMARY,
      upcCode: null,
      upcImage: null,
      productImage: null,
      error: null
    }));
  };

  const handleRemoveItem = (id: string) => {
    setState(prev => {
      const filtered = prev.lookItems.filter(item => item.id !== id);
      const lookSlug = prev.lookNumber.replace(/\s+/g, '_');
      const reindexed = filtered.map((item, index) => ({
        ...item,
        itemIndex: index + 1,
        fileName: `${item.upcCode}_${lookSlug}_${index + 1}.jpg`
      }));
      return {
        ...prev,
        lookItems: reindexed
      };
    });
  };

  const saveLookToDrive = async () => {
    if (state.lookItems.length === 0) {
      setState(prev => ({ ...prev, error: "Agrega al menos un producto al Look antes de subir." }));
      return;
    }

    if (!clientId) {
      setShowConfig(true);
      setState(prev => ({ ...prev, error: "Falta configurar el Google OAuth Client ID" }));
      return;
    }

    setUploadStatus('uploading');
    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      error: null,
      processingMessage: `PREPARANDO ARCHIVOS DE "${state.lookNumber.toUpperCase()}" PARA DRIVE...`
    }));

    try {
      const token = await driveService.getAccessToken(clientId.trim());
      
      if (!state.user) {
        const profile = await driveService.getUserProfile(token);
        const newUser: User = {
          name: profile.name,
          email: profile.email,
          picture: profile.picture
        };
        localStorage.setItem('cataloger_user', JSON.stringify(newUser));
        setState(prev => ({ ...prev, user: newUser }));
      }

      const { finalFolderName } = await driveService.uploadBatch(
        state.lookNumber,
        state.lookItems,
        token,
        (current, total, activeFolderName) => {
          setUploadProgress({ current, total });
          setState(prev => ({
            ...prev,
            processingMessage: `SUBIENDO A CARPETA ÚNICA "${activeFolderName}" (${current}/${total})...`
          }));
        }
      );

      setUploadStatus('success');
      setState(prev => ({ ...prev, isProcessing: false }));
    } catch (err: any) {
      const isAuthError = err.message?.includes('400') || err.message?.includes('auth');
      setState(prev => ({
        ...prev,
        error: isAuthError ? "Error de autorización Google OAuth. Revisa la consola de Google Cloud." : err.message,
        isProcessing: false
      }));
      setUploadStatus('idle');
      if (isAuthError) setShowConfig(true);
    }
  };

  const handleNextLook = () => {
    const currentNum = parseLookNumber(state.lookNumber);
    const nextNum = currentNum + 1;
    const nextLookStr = formatLookNumber(nextNum);
    localStorage.setItem('cataloger_look_count', nextNum.toString());

    setState(prev => ({
      ...prev,
      lookNumber: nextLookStr,
      lookItems: [],
      step: AppStep.LOOK_SUMMARY,
      upcCode: null,
      upcImage: null,
      productImage: null,
      isProcessing: false,
      error: null
    }));
    setUploadStatus('idle');
    setUploadProgress({ current: 0, total: 0 });
  };

  const handleSaveLookNumberEdit = () => {
    if (!tempLookInput.trim()) return;
    let formatted = tempLookInput.trim();
    if (/^\d+$/.test(formatted)) {
      formatted = formatLookNumber(parseInt(formatted, 10));
    }
    setState(prev => ({ ...prev, lookNumber: formatted }));
    setIsEditingLook(false);
  };

  const logout = () => {
    driveService.logout();
    localStorage.removeItem('cataloger_user');
    setState(prev => ({ ...prev, user: null }));
    alert("Sesión cerrada");
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 font-sans relative z-0 selection:bg-brand-gold selection:text-brand-navy">
      
      {/* Header Executive Navigation */}
      <header className="w-full max-w-4xl mb-8 flex items-center justify-between bg-brand-navy-light/95 p-4 md:p-5 rounded-3xl shadow-2xl shadow-black/50 border border-brand-gold/25 ring-1 ring-brand-gold/15 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-brand-gold via-brand-gold-dark to-slate-900 p-3 rounded-2xl shadow-lg shadow-brand-gold/20 text-brand-navy font-bold">
            <Layers size={26} className="text-brand-navy drop-shadow-sm" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-50 tracking-tight leading-none font-display flex items-center gap-2">
              Total Look <span className="text-xs bg-brand-gold/15 text-brand-gold px-2.5 py-0.5 rounded-full border border-brand-gold/30 font-sans tracking-normal">Studio AI</span>
            </h1>
            <p className="text-[10px] text-brand-gold-light/90 font-bold uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse shadow-sm shadow-brand-gold"/> Catalogación Pro por Looks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {state.user && (
            <div className="flex items-center gap-3 bg-brand-navy/90 border border-brand-gold/20 px-3 py-1.5 rounded-2xl shadow-inner">
              <div className="text-right hidden md:block">
                <p className="text-[10px] font-black text-slate-50 leading-none">{state.user.name}</p>
                <p className="text-[8px] font-bold text-brand-gold-light/80 uppercase tracking-tighter mt-0.5">{state.user.email}</p>
              </div>
              <img src={state.user.picture} alt="User" className="w-8 h-8 rounded-xl border border-brand-gold/40 shadow-sm" />
            </div>
          )}
          <div className="flex gap-1.5">
            <button 
              onClick={() => setShowConfig(!showConfig)}
              className={`p-2.5 rounded-2xl transition-all ${showConfig ? 'bg-brand-gold text-brand-navy shadow-lg shadow-brand-gold/30' : 'bg-brand-navy text-slate-400 hover:text-brand-gold border border-brand-gold/20'}`}
              title="Configuración"
            >
              <Settings size={20} />
            </button>
            <button 
              onClick={logout}
              className="p-2.5 rounded-2xl bg-brand-navy text-slate-400 hover:text-rose-400 border border-brand-gold/20 transition-all"
              title="Cerrar Sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Config Panel */}
      {showConfig && (
        <div className="w-full max-w-2xl mb-8 bg-brand-navy-light/95 p-8 rounded-[2.5rem] border border-brand-gold/40 shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-top-4 duration-300 backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-6 text-brand-gold">
            <ShieldCheck size={28} />
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-50 font-display">Autorización Google Cloud</h3>
          </div>
          
          <div className="space-y-6">
            <div className="bg-brand-navy border border-brand-gold/25 p-6 rounded-3xl text-brand-gold-light text-sm">
              <p className="font-black mb-4 flex items-center gap-2 text-slate-200 uppercase tracking-wide font-display">
                <Info size={18} className="text-brand-gold" /> Configura esta URL en tu consola:
              </p>
              <div className="flex items-center gap-2 bg-brand-navy-light/80 p-4 rounded-2xl border border-slate-800 shadow-inner mb-4">
                <code className="flex-1 font-mono font-bold text-brand-gold-light break-all">{window.location.origin}</code>
                <button 
                  onClick={copyOrigin}
                  className={`p-2.5 rounded-xl transition-all ${copied ? 'bg-emerald-800 text-emerald-200' : 'bg-brand-navy text-slate-400 hover:bg-slate-800'}`}
                >
                  {copied ? <CheckCircle size={20} /> : <Copy size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2 tracking-widest leading-none">Google OAuth Client ID</label>
              <input 
                type="text" 
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-6 py-4 bg-brand-navy border border-brand-gold/30 rounded-2xl text-xs font-mono focus:border-brand-gold outline-none transition-all text-slate-50 shadow-inner"
              />
            </div>
            
            <button 
              onClick={() => setShowConfig(false)}
              className="w-full py-5 bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold text-brand-navy font-black rounded-3xl hover:opacity-95 shadow-xl shadow-brand-gold/20 active:scale-95 uppercase tracking-widest text-sm"
            >
              Aplicar y Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="w-full max-w-3xl bg-brand-navy-light/95 rounded-[3rem] shadow-2xl shadow-black/80 border border-brand-gold/25 p-6 md:p-10 min-h-[580px] flex flex-col items-center relative overflow-hidden ring-1 ring-brand-gold/20 backdrop-blur-xl">
        
        {/* Processing Overlay */}
        {state.isProcessing && (
          <div className="absolute inset-0 bg-brand-navy/95 backdrop-blur-2xl z-50 flex flex-col items-center justify-center animate-in fade-in duration-300 px-8 text-center">
            <div className="relative mb-10">
              <Loader2 className="animate-spin text-brand-gold" size={80} strokeWidth={3} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles size={24} className="text-brand-gold-light animate-pulse" />
              </div>
            </div>
            <h3 className="text-2xl font-black text-slate-50 tracking-tight uppercase mb-2 font-display">{state.processingMessage}</h3>
            {uploadProgress.total > 0 && (
              <p className="text-lg font-mono font-bold text-brand-gold mt-2">
                {uploadProgress.current} / {uploadProgress.total} Productos Subidos
              </p>
            )}
            <p className="text-[10px] text-brand-gold font-bold uppercase tracking-[0.25em] mt-4 opacity-80">Total Look Studio AI • Steven's Panamá</p>
          </div>
        )}

        {/* Global Error Banner */}
        {state.error && (
          <div className="w-full mb-8 p-6 bg-rose-950/50 border border-rose-800/60 rounded-3xl flex gap-4 items-center text-rose-200 animate-in zoom-in duration-300 shadow-lg">
            <AlertCircle size={32} className="shrink-0 text-rose-400" />
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase mb-1 tracking-widest text-rose-400">Error de Sistema</p>
              <p className="text-sm font-bold leading-tight">{state.error}</p>
            </div>
            <button onClick={() => setState(prev => ({ ...prev, error: null }))} className="bg-brand-navy p-2 rounded-xl border border-slate-800 text-slate-200">×</button>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* STEP: LOOK SUMMARY & MAIN DASHBOARD                 */}
        {/* ---------------------------------------------------- */}
        {state.step === AppStep.LOOK_SUMMARY && (
          <div className="w-full flex flex-col items-center animate-in fade-in duration-300">
            
            {/* Look Header Badge & Editor */}
            <div className="w-full bg-brand-navy/90 border border-brand-gold/30 p-6 rounded-[2.5rem] mb-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl shadow-black/40 ring-1 ring-brand-gold/15">
              <div className="flex items-center gap-4">
                <div className="bg-brand-gold/15 p-4 rounded-2xl border border-brand-gold/35 text-brand-gold shadow-md">
                  <FolderPlus size={32} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {isEditingLook ? (
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={tempLookInput} 
                          onChange={(e) => setTempLookInput(e.target.value)}
                          className="px-3 py-1 bg-slate-900 border border-brand-gold rounded-xl text-lg font-black text-brand-gold font-display outline-none w-36 shadow-inner"
                          autoFocus
                        />
                        <button onClick={handleSaveLookNumberEdit} className="p-2 bg-brand-gold text-brand-navy rounded-xl shadow-md">
                          <Check size={18} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-2xl font-black text-slate-50 uppercase tracking-tight font-display">{state.lookNumber}</h2>
                        <button onClick={() => { setTempLookInput(state.lookNumber); setIsEditingLook(true); }} className="text-slate-400 hover:text-brand-gold transition-colors p-1" title="Editar número de Look">
                          <Edit3 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Subcarpeta en Google Drive: <span className="text-brand-gold-light font-mono font-bold">{state.lookNumber}</span></p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="bg-brand-gold/15 text-brand-gold font-bold px-4 py-2 rounded-2xl border border-brand-gold/30 text-xs font-mono shadow-inner flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse"/>
                  {state.lookItems.length} {state.lookItems.length === 1 ? 'Producto' : 'Productos'}
                </span>
              </div>
            </div>

            {/* Products Grid */}
            <div className="w-full mb-8">
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="text-xs font-black uppercase text-brand-gold-light tracking-widest">Productos Acumulados en este Look</h3>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Total Look Pro</span>
              </div>

              {state.lookItems.length === 0 ? (
                <div className="w-full border-2 border-dashed border-brand-gold/25 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center bg-brand-navy/30">
                  <div className="w-16 h-16 rounded-full bg-brand-navy border border-brand-gold/30 flex items-center justify-center text-brand-gold/60 mb-4 shadow-inner">
                    <Package size={32} />
                  </div>
                  <p className="text-slate-200 font-bold text-base uppercase font-display">No hay productos en este Look</p>
                  <p className="text-slate-400 text-xs mt-1 max-w-sm">Haz clic en el botón inferior para escanear el primer producto del {state.lookNumber}.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                  {state.lookItems.map((item) => (
                    <div key={item.id} className="bg-brand-navy border border-brand-gold/20 rounded-3xl p-4 flex flex-col justify-between group hover:border-brand-gold/60 hover:shadow-[0_8px_30px_rgb(101,203,207,0.15)] transition-all shadow-lg">
                      <div className="relative aspect-square bg-slate-950 rounded-2xl overflow-hidden mb-3 border border-slate-800">
                        <img src={item.productImage} alt={item.fileName} className="w-full h-full object-contain p-2" />
                        <span className="absolute top-2 left-2 bg-brand-navy/90 border border-brand-gold/40 text-brand-gold font-mono font-black text-[9px] px-2 py-0.5 rounded-lg shadow-sm">
                          #{item.itemIndex}
                        </span>
                        <button 
                          onClick={() => handleRemoveItem(item.id)}
                          className="absolute top-2 right-2 bg-rose-950/90 hover:bg-rose-600 text-rose-200 p-1.5 rounded-xl border border-rose-900 transition-colors opacity-90 sm:opacity-0 group-hover:opacity-100 shadow-sm"
                          title="Eliminar producto"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-brand-gold uppercase tracking-widest">UPC: {item.upcCode}</p>
                        <p className="text-xs font-mono font-bold text-slate-200 truncate mt-0.5" title={item.fileName}>
                          {item.fileName}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="w-full flex flex-col gap-3">
              <button 
                onClick={handleStartNewItem}
                className="w-full bg-brand-navy hover:bg-brand-navy-light text-brand-gold font-black py-5 rounded-3xl border border-brand-gold/40 flex items-center justify-center gap-3 shadow-lg active:scale-95 uppercase tracking-widest text-xs transition-all hover:border-brand-gold"
              >
                <Plus size={22} />
                <span>Agregar Producto al {state.lookNumber}</span>
              </button>

              {uploadStatus === 'success' ? (
                <div className="w-full bg-emerald-950/30 border border-emerald-700/50 p-8 rounded-[2.5rem] flex flex-col items-center gap-4 animate-in zoom-in duration-300 text-center shadow-xl">
                  <div className="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xl border-4 border-brand-navy"><CheckCircle size={32} /></div>
                  <div>
                    <h4 className="font-black text-emerald-300 text-xl uppercase tracking-tight font-display">¡{state.lookNumber} Subido con Éxito!</h4>
                    <p className="text-slate-400 text-xs font-bold mt-1">Archivos codificados sincronizados directamente en la carpeta Total_Look.</p>
                  </div>
                  <button 
                    onClick={handleNextLook}
                    className="w-full bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold text-brand-navy font-black py-4 rounded-2xl hover:opacity-95 transition-all shadow-lg shadow-brand-gold/20 active:scale-95 uppercase text-xs tracking-widest mt-2"
                  >
                    Comenzar Siguiente Look ({formatLookNumber(parseLookNumber(state.lookNumber) + 1)})
                  </button>
                </div>
              ) : (
                state.lookItems.length > 0 && (
                  <button 
                    onClick={saveLookToDrive}
                    disabled={uploadStatus === 'uploading'}
                    className="w-full bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold hover:opacity-95 text-brand-navy font-black py-6 rounded-[2.5rem] flex items-center justify-center gap-3 shadow-[0_10px_35px_rgba(101,203,207,0.25)] transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Cloud size={28} />
                    <span className="text-xl uppercase tracking-widest font-display">Finalizar y Subir {state.lookNumber} ({state.lookItems.length})</span>
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* STEP 1: SCAN UPC                                     */}
        {/* ---------------------------------------------------- */}
        {state.step === AppStep.SCAN_UPC && (
          <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="w-full flex items-center justify-between mb-8">
              <button 
                onClick={() => setState(prev => ({ ...prev, step: AppStep.LOOK_SUMMARY }))} 
                className="p-3 hover:bg-brand-navy rounded-2xl transition-all text-slate-400 border border-brand-gold/20 hover:text-brand-gold"
              >
                <ArrowLeft size={22} />
              </button>
              <div className="text-center">
                <span className="text-[10px] font-mono font-black text-brand-gold uppercase tracking-widest bg-brand-gold/15 px-3.5 py-1 rounded-full border border-brand-gold/30">
                  {state.lookNumber} • Producto #{state.lookItems.length + 1}
                </span>
                <h2 className="text-2xl font-black text-slate-50 tracking-tight uppercase font-display mt-1">Escanear Código UPC</h2>
              </div>
              <div className="w-12" />
            </div>

            <Camera onCapture={handleCaptureUPC} label="APUNTA AL CÓDIGO DE BARRAS" />
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* STEP 2: PRODUCT PHOTO                                */}
        {/* ---------------------------------------------------- */}
        {state.step === AppStep.PRODUCT_PHOTO && (
          <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="w-full flex items-center justify-between mb-8">
              <button 
                onClick={() => setState(prev => ({ ...prev, step: AppStep.SCAN_UPC }))} 
                className="p-3 hover:bg-brand-navy rounded-2xl transition-all text-slate-400 border border-brand-gold/20 hover:text-brand-gold"
              >
                <ArrowLeft size={22} />
              </button>
              <div className="text-center">
                <h2 className="text-2xl font-black text-slate-50 uppercase tracking-tight font-display">Foto de Producto</h2>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className="text-brand-gold font-mono font-black text-[10px] bg-brand-gold/15 px-3 py-1 rounded-full border border-brand-gold/30">
                    UPC: {state.upcCode}
                  </span>
                </div>
              </div>
              <div className="w-12" />
            </div>

            <Camera onCapture={handleCaptureProduct} label="FOTO DE PRODUCTO PARA ESTUDIO AI" />
            <p className="mt-6 text-[10px] text-slate-400 font-black uppercase tracking-widest text-center">Fondo Blanco Absoluto • 1000x1000 px • Escala 95%</p>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* STEP 3: REVIEW ITEM BEFORE ADDING TO LOOK             */}
        {/* ---------------------------------------------------- */}
        {state.step === AppStep.REVIEW_ITEM && state.productImage && (
          <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-brand-gold/15 text-brand-gold px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-brand-gold/35 mb-3">
                <Sparkles size={14} className="text-brand-gold" /> Producto #{state.lookItems.length + 1} en {state.lookNumber}
              </div>
              <h2 className="text-3xl font-black text-slate-50 tracking-tight uppercase font-display">Confirmar Producto</h2>
            </div>

            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-4 flex flex-col justify-center">
                <div className="bg-brand-navy/90 rounded-[2rem] p-6 border border-brand-gold/25 shadow-inner">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Nombre de Archivo a Generar</span>
                  <div className="flex items-center gap-3">
                    <FileText size={24} className="text-brand-gold shrink-0" />
                    <p className="text-lg font-mono font-black text-slate-50 break-all">
                      {state.upcCode}_{state.lookNumber.replace(/\s+/g, '_')}_{state.lookItems.length + 1}.jpg
                    </p>
                  </div>
                </div>

                <div className="bg-brand-navy/60 rounded-[2rem] p-6 border border-brand-gold/20">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Destino Final</span>
                  <p className="text-xs font-bold text-slate-200">
                    Google Drive ➔ Carpeta <span className="text-brand-gold font-mono font-bold">{state.lookNumber}</span>
                  </p>
                </div>
              </div>

              <div className="relative aspect-square bg-slate-950 rounded-[2.5rem] overflow-hidden border-8 border-brand-navy shadow-2xl ring-1 ring-brand-gold/30">
                <img src={state.productImage} alt="Clean Product" className="w-full h-full object-contain p-4" />
              </div>
            </div>

            <div className="flex flex-col w-full gap-3">
              <button 
                onClick={handleConfirmAddItem}
                className="w-full bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold text-brand-navy font-black py-6 rounded-[2.5rem] flex items-center justify-center gap-3 shadow-[0_10px_35px_rgba(101,203,207,0.25)] transition-all active:scale-95"
              >
                <CheckCircle size={28} />
                <span className="text-xl uppercase tracking-widest font-display">Agregar al {state.lookNumber}</span>
              </button>

              <button 
                onClick={() => setState(prev => ({ ...prev, step: AppStep.LOOK_SUMMARY, upcCode: null, productImage: null }))}
                className="bg-brand-navy border border-brand-gold/20 text-slate-400 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest hover:bg-slate-800/60 hover:text-slate-200 transition-colors"
              >
                Descartar Producto
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto pt-10 pb-6 text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] flex flex-col items-center gap-3">
        <div className="flex items-center gap-6 bg-brand-navy-light/95 px-8 py-3 rounded-full border border-brand-gold/20 shadow-md backdrop-blur-md">
           <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-brand-gold animate-pulse shadow-sm shadow-brand-gold"/> TOTAL LOOK ENGINE</span>
           <div className="w-px h-4 bg-slate-800"/>
           <span className="flex items-center gap-2"><Sparkles size={14} className="text-brand-gold"/> STEVENS ECOMMERCE STUDIO</span>
        </div>
        <p className="opacity-40">Stevens Panamá &copy; 2026 • Google OAuth v2 Secure</p>
      </footer>
    </div>
  );
};

export default App;
