import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Image as ImageIcon, AlertTriangle, Loader2, Trash2, RefreshCw, Key } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';

const SHEET_MAP = {
    "E1": '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
    "E2": '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
    "E3": '1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU'
};

const PATRONES = {
    "INICIAL": ["_inicial"],
    "CAJA": ["_caja"],
    "FINAL": ["_terminado"]
};

// 100% Serverless / Stateless: The Browser talks directly to Google APIs!
const PhotoCard = ({ title, photoObj, folio, folderId, internalCategoryName, onActionSuccess, stage, isVerifying, accessToken, logToSheet }) => {
    const [blobUrl, setBlobUrl] = useState(null);
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [tokenExpired, setTokenExpired] = useState(false);

    const getDriveId = (url) => {
        const match = url?.match(/\/d\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null; 
    };

    const driveId = photoObj?.id || getDriveId(photoObj?.view);
    const stableImageSrc = driveId 
        ? `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media` 
        : (photoObj?.thumbnail ? photoObj.thumbnail.replace('=s220', '=s800') : '');

    // Fetch image with Bearer token to show private Drive files
    useEffect(() => {
        // Reset state on each image change
        setTokenExpired(false);
        setBlobUrl(null);

        if (!driveId) {
            setIsImageLoading(false);
            return;
        }

        if (!accessToken) {
            // No token: try the public thumbnail as fallback
            setBlobUrl(`https://drive.google.com/thumbnail?id=${driveId}&sz=w800`);
            setIsImageLoading(true);
            return;
        }

        let isMounted = true;
        setIsImageLoading(true);

        const fetchImage = async () => {
            try {
                const response = await fetch(stableImageSrc, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                if (response.status === 401) {
                    // Token has expired — show a clear message instead of a broken image
                    if (isMounted) {
                        setTokenExpired(true);
                        setIsImageLoading(false);
                    }
                    return;
                }

                if (response.ok) {
                    const blob = await response.blob();
                    if (isMounted) {
                        setBlobUrl(URL.createObjectURL(blob));
                    }
                } else {
                    // Other errors: fallback to public thumbnail
                    if (isMounted) setBlobUrl(`https://drive.google.com/thumbnail?id=${driveId}&sz=w800`);
                }
            } catch (err) {
                console.error("Error fetching private image:", err);
                if (isMounted) setBlobUrl(`https://drive.google.com/thumbnail?id=${driveId}&sz=w800`);
            }
        };

        fetchImage();
        return () => { 
            isMounted = false; 
            if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl); 
        };
    }, [driveId, accessToken]);

    const handleDragOver = (e) => {
        e.preventDefault();
        if (!driveId) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const uploadToGoogleDrive = async (file) => {
        return new Promise((resolve, reject) => {
            const boundary = '-------314159265358979323846';
            const delimiter = "\r\n--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";

            let typeStr = internalCategoryName.toLowerCase();
            if (typeStr === 'final') typeStr = 'terminado';
            
            // Extract extension
            const extension = file.name.substring(file.name.lastIndexOf('.')) || '.jpg';
            const fileName = `${folio}_${typeStr}${extension}`;

            const metadata = {
                name: fileName,
                parents: [folderId]
            };

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async function() {
                const base64Data = reader.result.split('base64,')[1];
                const multipartRequestBody =
                    delimiter +
                    'Content-Type: application/json\r\n\r\n' +
                    JSON.stringify(metadata) +
                    delimiter +
                    'Content-Type: ' + file.type + '\r\n' +
                    'Content-Transfer-Encoding: base64\r\n\r\n' +
                    base64Data +
                    close_delim;

                try {
                    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,thumbnailLink', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + accessToken,
                            'Content-Type': 'multipart/related; boundary=' + boundary
                        },
                        body: multipartRequestBody
                    });
                    
                    if (!res.ok) throw new Error(await res.text());
                    const data = await res.json();
                    resolve(data);
                } catch(e) {
                    reject(e);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
        });
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (stableImageSrc || isUploading || isDeleting || isVerifying) return;
        if (!accessToken) {
            alert('Debes Iniciar Sesión con Google primero (botón arriba).');
            return;
        }

        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        if (!folderId) {
            alert('El folio fue catalogado como SIN CARPETA. Crea la carpeta primero en Drive y actualiza el Dashboard.');
            return;
        }

        setIsUploading(true);

        try {
            const uploadedData = await uploadToGoogleDrive(file);
            console.log(`✅ ¡Éxito! Archivo subido directo a Drive con ID: ${uploadedData.id}`);
            
            // Log to spreadsheet directly from browser!
            await logToSheet('SUBIDA', folio, internalCategoryName, uploadedData.id);

            setIsImageLoading(true);
            if (onActionSuccess) onActionSuccess();
        } catch (err) {
            alert(`Error de red con Google Drive API: ${err.message}`);
        }
        setIsUploading(false);
    };

    const handleDelete = async () => {
        if (!accessToken) {
            alert('Debes Iniciar Sesión con Google primero (botón arriba).');
            return;
        }
        if (!confirm(`¿Estás seguro de que quieres eliminar la evidencia ${title} de Google Drive?`)) return;
        
        setIsDeleting(true);
        try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?supportsAllDrives=true`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            
            if (!res.ok) throw new Error(await res.text());
            
            console.log(`🗑️ Eliminada evidencia de Drive directo: ${driveId}`);
            await logToSheet('ELIMINACIÓN', folio, internalCategoryName, driveId);

            if (onActionSuccess) onActionSuccess();
        } catch (err) {
            alert(`Error de comunicación directa con Google Drive: ${err.message}`);
        }
        setIsDeleting(false);
    };

    if (!driveId) {
        return (
            <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed h-64 transition-all
                ${isDragging ? 'bg-primary/5 border-primary scale-105 shadow-lg' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600'}
                ${isUploading || isVerifying ? 'opacity-75' : ''}`}
            >
                {isUploading || isVerifying ? (
                    <>
                        <Loader2 className="w-12 h-12 text-primary animate-spin mb-3" />
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">
                            {isUploading ? 'Subiendo...' : 'Verificando...'}
                        </p>
                    </>
                ) : (
                    <>
                        <AlertTriangle className={`${isDragging ? 'text-primary' : 'text-orange-400'} w-12 h-12 mb-3 transition-colors`} strokeWidth={1.5} />
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 pointer-events-none">
                            {isDragging ? 'SUELTA LA FOTO AQUÍ' : 'SIN EVIDENCIA'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 uppercase text-center pointer-events-none">
                            {isDragging ? `Se renombrará como _${internalCategoryName}` : title}
                        </p>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col group relative rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div className="bg-slate-50 dark:bg-slate-700 p-3 border-b border-slate-200 dark:border-slate-600 flex justify-between items-center z-10 relative">
                <h4 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">{title}</h4>
                <div className="flex gap-2">
                    <button
                        onClick={handleDelete}
                        disabled={isDeleting || isVerifying || !accessToken}
                        className="p-1.5 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg text-red-500 dark:text-red-400 shadow-sm transition-colors disabled:opacity-50"
                        title="Eliminar de Drive"
                    >
                        {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                    <a
                        href={photoObj?.view || photoObj?.thumbnail} 
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 bg-white dark:bg-slate-600 rounded-lg text-primary dark:text-white shadow-sm hover:scale-105 transition-transform"
                        title="Abrir imagen completa"
                    >
                        <ExternalLink size={16} />
                    </a>
                </div>
            </div>
            
            <div className="h-64 w-full relative bg-slate-200 dark:bg-slate-900 overflow-hidden flex items-center justify-center">
                {(isDeleting || isVerifying) && (
                    <div className="absolute inset-0 bg-slate-900/40 z-20 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 text-white animate-spin" />
                    </div>
                )}

                {/* Token expired overlay */}
                {tokenExpired && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-amber-50 dark:bg-amber-900/20 z-10 gap-3 p-4">
                        <AlertTriangle className="w-10 h-10 text-amber-500" strokeWidth={1.5}/>
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase text-center tracking-wide">
                            Sesión expirada. Vuelve a conectar tu Google.
                        </p>
                    </div>
                )}

                {isImageLoading && !tokenExpired && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 z-0">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Cargando...</span>
                    </div>
                )}
                <img 
                    src={blobUrl} 
                    alt={`Evidencia ${title}`}
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-cover transition-opacity duration-500 relative z-10 ${isImageLoading || tokenExpired ? 'opacity-0' : 'opacity-100'}`}
                    onLoad={() => setIsImageLoading(false)}
                    onError={(e) => { 
                        setIsImageLoading(false);
                        if (!e.target.dataset.failed && photoObj?.thumbnail) {
                            e.target.dataset.failed = true;
                            e.target.src = photoObj.thumbnail;
                        }
                    }}
                />
            </div>
        </div>
    );
};

export default function FolioVisualizerModal({ isOpen, onClose, folioData, onFolioSync }) {
    const [isVerifying, setIsVerifying] = useState(false);
    const [accessToken, setAccessToken] = useState(() => localStorage.getItem('drive_access_token'));
    
    const { FOLIO, CALLE, COLONIA, RESULTADO_AUDITORIA, PHOTOS, _folderId, _stage } = folioData || {};

    const login = useGoogleLogin({
        onSuccess: (tokenResponse) => {
            setAccessToken(tokenResponse.access_token);
            localStorage.setItem('drive_access_token', tokenResponse.access_token);
        },
        scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets'
    });

    const triggerVerification = async () => {
        if (!_folderId) return;
        if (!accessToken) {
            console.log("No auth token, bypassing direct live verification");
            return;
        }

        setIsVerifying(true);
        try {
            const query = encodeURIComponent(`'${_folderId}' in parents and trashed = false`);
            const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,thumbnailLink)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100`;
            const driveRes = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken }});
            
            if (driveRes.status === 401) {
                // Token expired!
                setAccessToken(null);
                localStorage.removeItem('drive_access_token');
                throw new Error("Token expirado, vuelve a conectar Tu Google.");
            }
            if (!driveRes.ok) throw new Error(await driveRes.text());

            const resData = await driveRes.json();
            const files = resData.files || [];
            
            const photosMap = { INICIAL: null, CAJA: null, FINAL: null };
            let status = "OK";
            if (files.length === 0) {
                status = "CARPETA VACÍA";
            } else {
                const encontradas = new Set();
                for (const f of files) {
                    for (const [cat, patrones] of Object.entries(PATRONES)) {
                        if (patrones.some(p => f.name.toLowerCase().includes(p))) {
                            encontradas.add(cat);
                            if (!photosMap[cat]) {
                                photosMap[cat] = {
                                    id: f.id,
                                    thumbnail: f.thumbnailLink,
                                    view: f.webViewLink
                                };
                            }
                        }
                    }
                }
                const reqs = ["INICIAL", "CAJA", "FINAL"];
                const faltantes = reqs.filter(r => !encontradas.has(r));
                if (faltantes.length > 0) {
                    status = "FALTA: " + faltantes.join(" + ");
                }
            }

            if (onFolioSync) onFolioSync(FOLIO, photosMap, status);
        } catch (error) {
            console.error("Verification error:", error);
        }
        setIsVerifying(false);
    };

    const logToSheet = async (action, folio, type, fileId) => {
        if (!accessToken) return;
        const spreadsheetId = SHEET_MAP['E2'];
        const dateStr = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        const range = encodeURIComponent("'Historial de Actividades'!A:F");
        
        try {
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    values: [[dateStr, folio, 'Administrador Vercel', action, type, fileId]]
                })
            });
            console.log(`[Log Registrado] ${action} en Folio ${folio}`);
        } catch(e) {
            console.error("Fallo al escribir en log google sheets:", e);
        }
    };

    useEffect(() => {
        if (isOpen && _folderId && accessToken) {
            triggerVerification();
        }
    }, [isOpen, _folderId, accessToken]);

    if (!isOpen || !folioData) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                />
                
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
                                    FOLIO {FOLIO}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${RESULTADO_AUDITORIA === 'OK' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                        {RESULTADO_AUDITORIA}
                                    </span>
                                    {isVerifying && (
                                        <span className="flex flex-row items-center gap-1 text-[10px] font-bold text-slate-500 uppercase bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-full">
                                            <RefreshCw size={12} className="animate-spin" /> Verificando
                                        </span>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">location_on</span>
                                {CALLE || 'Calle No Especificada'}, {COLONIA || 'Colonia No Especificada'}
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-4">
                            {!accessToken ? (
                                <button 
                                    onClick={() => login()}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold shadow-md transition-colors text-sm"
                                >
                                    <Key size={16}/> Connect Google (Administrador)
                                </button>
                            ) : (
                                <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full flex items-center gap-2 border border-green-200 shadow-sm">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> Cuenta Autorizada
                                </span>
                            )}
                            <button 
                                onClick={onClose}
                                className="p-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-600 dark:text-slate-300"
                            >
                                <X size={24} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <PhotoCard title="Inicial (Bache)" photoObj={PHOTOS?.INICIAL} folio={FOLIO} folderId={_folderId} stage={_stage} internalCategoryName="INICIAL" onActionSuccess={triggerVerification} isVerifying={isVerifying} accessToken={accessToken} logToSheet={logToSheet} />
                            <PhotoCard title="Caja (Fresado)" photoObj={PHOTOS?.CAJA} folio={FOLIO} folderId={_folderId} stage={_stage} internalCategoryName="CAJA" onActionSuccess={triggerVerification} isVerifying={isVerifying} accessToken={accessToken} logToSheet={logToSheet} />
                            <PhotoCard title="Terminado" photoObj={PHOTOS?.FINAL} folio={FOLIO} folderId={_folderId} stage={_stage} internalCategoryName="FINAL" onActionSuccess={triggerVerification} isVerifying={isVerifying} accessToken={accessToken} logToSheet={logToSheet} />
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
