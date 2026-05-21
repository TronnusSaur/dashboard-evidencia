import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Image as ImageIcon, AlertTriangle, Loader2, Trash2, RefreshCw, Key, Pencil, FolderOpen, Check, FileImage, File as FileIcon, Clock } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db as firestoreDb } from "../lib/firebase";

const SHEET_MAP = {
    "E1": '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
    "E2": '1XsAB-ADnF8xqFOvsW9w9PGDCDI51OJbvYPVyFXTZ9j8',
    "E3": '1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU'
};

const SUPERVISOR_ROOT_ID = '1B54IJmRS_D2J_FECE75RRo3UejfzUPU6';

const FOTO_LABELS = {
    'FOLIO': 'Folio',
    'CORTE': 'Corte',
    'DEMOLICION': 'Demolición',
    'LIGA': 'Liga',
    'MEZCLA': 'Mezcla',
    'LIMPIEZA': 'Limpieza'
};

const CONFIG_FOTOS = {
    LEGACY: [
        { id: 'INICIAL', pattern: '_inicial', label: 'Inicial (Bache)' },
        { id: 'CAJA', pattern: '_caja', label: 'Caja (Fresado)' },
        { id: 'TERMINADO', pattern: '_terminado', label: 'Terminado' }
    ],
    NEW: [
        { id: 'INICIAL', pattern: '_inicial', label: '1. Inicial' },
        { id: 'FOLIO', pattern: '_folio', label: '2. Folio' },
        { id: 'CORTE', pattern: '_corte', label: '3. Corte' },
        { id: 'DEMOLICION', pattern: '_demolicion', label: '4. Demolición' },
        { id: 'CAJA', pattern: '_caja', label: '5. Caja' },
        { id: 'LIGA', pattern: '_liga', label: '6. Liga' },
        { id: 'MEZCLA', pattern: '_mezcla', label: '7. Mezcla' },
        { id: 'TERMINADO', pattern: '_terminado', label: '8. Terminado' },
        { id: 'LIMPIEZA', pattern: '_limpieza', label: '9. Limpieza' }
    ]
};

const isLegacyDate = (fechaStr) => {
    if (!fechaStr) return false;
    let parts = fechaStr.split('/');
    if (parts.length !== 3) {
        parts = fechaStr.split('-');
    }
    if (parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            day = parseInt(parts[2], 10);
        } else {
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            year = parseInt(parts[2], 10);
        }
        if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
        const date = new Date(year, month, day);
        const threshold = new Date(2026, 3, 20); // 20 de abril de 2026
        return date < threshold;
    }
    return false;
};

// 100% Serverless / Stateless: The Browser talks directly to Google APIs!
const PhotoCard = ({ title, photoObj, folio, folderId, internalCategoryName, onActionSuccess, stage, isVerifying, accessToken, logToSheet, isEditable }) => {
    const [blobUrl, setBlobUrl] = useState(null);
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [tokenExpired, setTokenExpired] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [isRenamingLoading, setIsRenamingLoading] = useState(false);

    const getDriveId = (url) => {
        const match = url?.match(/\/d\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null; 
    };

    const driveFileId = photoObj?.id || getDriveId(photoObj?.view);
    const stableImageSrc = driveFileId 
        ? `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media` 
        : (photoObj?.thumbnail ? photoObj.thumbnail.replace('=s220', '=s800') : '');

    const handleCardRename = async () => {
        if (!renameValue.trim() || !driveFileId || !accessToken) return;
        setIsRenamingLoading(true);
        try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?supportsAllDrives=true`, {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: renameValue })
            });
            if (!res.ok) throw new Error(await res.text());
            console.log(`✏️ PhotoCard renombrado: ${renameValue}`);
            await logToSheet('RENOMBRADO', folio, renameValue, driveFileId);
            setIsRenaming(false);
            setRenameValue('');
            if (onActionSuccess) onActionSuccess();
        } catch (err) {
            alert(`Error al renombrar: ${err.message}`);
        }
        setIsRenamingLoading(false);
    };
    // Fetch image with Bearer token to show private Drive files
    useEffect(() => {
        // Reset state on each image change
        setTokenExpired(false);
        setBlobUrl(null);

        if (!driveFileId) {
            setIsImageLoading(false);
            return;
        }

        if (!accessToken) {
            // No token: try the public thumbnail as fallback
            setBlobUrl(`https://drive.google.com/thumbnail?id=${driveFileId}&sz=w800`);
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
                    if (isMounted) setBlobUrl(`https://drive.google.com/thumbnail?id=${driveFileId}&sz=w800`);
                }
            } catch (err) {
                console.error("Error fetching private image:", err);
                if (isMounted) setBlobUrl(`https://drive.google.com/thumbnail?id=${driveFileId}&sz=w800`);
            }
        };

        fetchImage();
        return () => { 
            isMounted = false; 
            if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl); 
        };
    }, [driveFileId, accessToken]);

    const handleDragOver = (e) => {
        e.preventDefault();
        if (!driveFileId) setIsDragging(true);
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

            // Extract extension
            const extension = file.name.substring(file.name.lastIndexOf('.')) || '.jpg';
            
            // Map internal category to proper suffix
            let suffix = `_${internalCategoryName.toLowerCase()}`;

            const fileName = `${folio}${suffix}${extension}`;

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
        if (!isEditable) {
            alert('No tienes permisos de Edici\u00f3n. Solo cuentas verificadas pueden subir fotos.');
            return;
        }
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
        if (!isEditable) {
            alert('No tienes permisos para eliminar. Solo cuentas verificadas pueden realizar esta acci\u00f3n.');
            return;
        }
        if (!accessToken) {
            alert('Debes Iniciar Sesión con Google primero (botón arriba).');
            return;
        }
        if (!confirm(`¿Estás seguro de que quieres eliminar la evidencia ${title} de Google Drive?`)) return;
        
        setIsDeleting(true);
        try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?supportsAllDrives=true`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            
            if (!res.ok) throw new Error(await res.text());
            
            console.log(`🗑️ Eliminada evidencia de Drive directo: ${driveFileId}`);
            await logToSheet('ELIMINACIÓN', folio, internalCategoryName, driveFileId);

            if (onActionSuccess) onActionSuccess();
        } catch (err) {
            alert(`Error de comunicación directa con Google Drive: ${err.message}`);
        }
        setIsDeleting(false);
    };

    if (!driveFileId) {
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
                <div className="flex gap-1.5">
                    {isEditable && (
                        <>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting || isVerifying || !accessToken}
                                className="p-1.5 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg text-red-500 dark:text-red-400 shadow-sm transition-colors disabled:opacity-50"
                                title="Eliminar de Drive"
                            >
                                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                            <button
                                onClick={() => {
                                    // Pre-fill with current expected name
                                    const ext = '.jpg';
                                    let suffix = `_${internalCategoryName.toLowerCase()}`;
                                    setRenameValue(`${folio}${suffix}${ext}`);
                                    setIsRenaming(true);
                                }}
                                disabled={isRenamingLoading || isVerifying || !accessToken}
                                className="p-1.5 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg text-amber-600 dark:text-amber-400 shadow-sm transition-colors disabled:opacity-50"
                                title="Renombrar archivo en Drive"
                            >
                                {isRenamingLoading ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                            </button>
                        </>
                    )}
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
            
            {/* Inline Rename Form */}
            {isRenaming && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-3 py-2">
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase mb-1.5">Renombrar archivo</p>
                    <div className="flex gap-1.5">
                        <input
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCardRename()}
                            className="flex-1 px-2 py-1 text-xs border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            autoFocus
                        />
                        <button onClick={handleCardRename} disabled={isRenamingLoading} className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black rounded-lg disabled:opacity-50">
                            {isRenamingLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button onClick={() => { setIsRenaming(false); setRenameValue(''); }} className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-black rounded-lg">
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}

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

export default function FolioVisualizerModal({ isOpen, onClose, folioData, onFolioSync, driveMode = 'ADMIN' }) {
    const [isVerifying, setIsVerifying] = useState(false);
    const [accessToken, setAccessToken] = useState(() => localStorage.getItem('drive_access_token'));
    const [userProfile, setUserProfile] = useState(() => {
        const saved = localStorage.getItem('google_user_profile');
        return saved ? JSON.parse(saved) : null;
    });
    const [extraFiles, setExtraFiles] = useState([]);
    const [editingFile, setEditingFile] = useState(null);
    const [renamingId, setRenamingId] = useState(null);
    const [isNewSet, setIsNewSet] = useState(false);
    const [livePhotos, setLivePhotos] = useState(null);
    const [currentFolderId, setCurrentFolderId] = useState(null); // initialized in useEffect from _folderId
    const [liveFaltanNEO, setLiveFaltanNEO] = useState([]);
    
    const { FOLIO, CALLE, COLONIA, RESULTADO_AUDITORIA, PHOTOS, _folderId, _stage, _isNewSet, _company, ID, _faltanNEO, FECHA } = folioData || {};

    useEffect(() => {
        setLivePhotos(null);
        setExtraFiles([]);
        setCurrentFolderId(_folderId || null);
        if (isLegacyDate(FECHA)) {
            setLiveFaltanNEO([]);
            setIsNewSet(false);
        } else {
            setLiveFaltanNEO(_faltanNEO || []);
            if (_isNewSet !== undefined) setIsNewSet(_isNewSet);
        }
    }, [FOLIO, _isNewSet, driveMode, _faltanNEO, FECHA, _folderId]);

    const AUTHORIZED_EDITORS = [
        "dgopbacheot@gmail.com", 
        "juanpablobumblebee@gmail.com", 
        "soranoautodgop@gmail.com", 
        "soranodex@gmail.com",
        "terceraetapabacheo@gmail.com"
    ];
    const isAuthorizedEditor = userProfile && AUTHORIZED_EDITORS.some(email => 
        email.toLowerCase() === userProfile.email.toLowerCase()
    );

    const fetchUserProfile = async (token) => {
        try {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const profile = await res.json();
                setUserProfile(profile);
                localStorage.setItem('google_user_profile', JSON.stringify(profile));
            }
        } catch (error) {
            console.error("Error fetching user profile:", error);
        }
    };

    const login = useGoogleLogin({
        onSuccess: (tokenResponse) => {
            setAccessToken(tokenResponse.access_token);
            localStorage.setItem('drive_access_token', tokenResponse.access_token);
            fetchUserProfile(tokenResponse.access_token);
            triggerVerification();
        },
        scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
    });

    // ── Supervisor Drive Tree Walking ──────────────────────────────────────
    // Instead of global search + parent validation (which fails for shared drives),
    // we walk the tree: Root → Contracts → Weeks → Folios
    const supTreeCacheRef = React.useRef(null); // { folioMap: { normalizedFolio: folderId } }
    const supTreePromiseRef = React.useRef(null); // Singleton promise for tree building

    const buildSupervisorTree = async () => {
        if (supTreeCacheRef.current) return supTreeCacheRef.current;
        if (supTreePromiseRef.current) return supTreePromiseRef.current;

        supTreePromiseRef.current = (async () => {
        if (!accessToken) return null;

        console.log('🌳 Building supervisor drive tree...');
        const folioMap = {};

        const listChildren = async (parentId) => {
            let allFiles = [];
            let pageToken = '';
            do {
                const q = encodeURIComponent(`'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
                let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=200`;
                if (pageToken) url += `&pageToken=${pageToken}`;
                const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken }});
                if (!res.ok) break;
                const data = await res.json();
                allFiles = allFiles.concat(data.files || []);
                pageToken = data.nextPageToken || '';
            } while (pageToken);
            return allFiles;
        };

        try {
            // Level 1: Contract folders under root (e.g. "ALSAFI-001-3ETAPA")
            const contracts = await listChildren(SUPERVISOR_ROOT_ID);
            console.log(`  📂 ${contracts.length} contratos encontrados`);

            // Level 2 & 3: Week folders, then Folio folders
            for (const contract of contracts) {
                const weeks = await listChildren(contract.id);
                for (const week of weeks) {
                    const folios = await listChildren(week.id);
                    for (const folio of folios) {
                        const norm = folio.name.trim().replace(/^0+/, '');
                        folioMap[norm] = folio.id;
                    }
                }
            }

            console.log(`  ✅ ${Object.keys(folioMap).length} folios mapeados en drive de supervisores`);
            supTreeCacheRef.current = folioMap;
            return folioMap;
        } catch (e) {
            console.error('Error building supervisor tree:', e);
            return null;
        } finally {
            supTreePromiseRef.current = null;
        }
    })();
    return supTreePromiseRef.current;
    };

    const findSupervisorFolder = async (folioNumber) => {
        if (!accessToken || !folioNumber) return null;

        // Try cached tree first
        let tree = supTreeCacheRef.current;
        if (!tree) {
            tree = await buildSupervisorTree();
        }
        if (!tree) return null;

        const targetNorm = String(folioNumber).replace(/^0+/, '');
        if (tree[targetNorm]) return tree[targetNorm];

        // If not in cache, try a targeted API search as fallback
        try {
            const q = encodeURIComponent(`name = '${folioNumber}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
            const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,parents)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=10`;
            const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken }});
            if (!res.ok) return null;
            const data = await res.json();
            
            for (const f of (data.files || [])) {
                // Verify parent chain reaches SUPERVISOR_ROOT_ID
                let cur = f.parents?.[0];
                let depth = 0;
                while (cur && depth < 6) {
                    if (cur === SUPERVISOR_ROOT_ID) {
                        // Cache it for next time
                        tree[targetNorm] = f.id;
                        return f.id;
                    }
                    try {
                        const pRes = await fetch(`https://www.googleapis.com/drive/v3/files/${cur}?fields=parents&supportsAllDrives=true`, {
                            headers: { 'Authorization': 'Bearer ' + accessToken }
                        });
                        if (!pRes.ok) break;
                        const pData = await pRes.json();
                        cur = pData.parents?.[0];
                        depth++;
                    } catch { break; }
                }
            }
        } catch (e) { console.error('Supervisor fallback search error:', e); }

        return null;
    };

    const triggerVerification = async () => {
        if (!isOpen || !FOLIO) return;

        let resolvedFolderId = _folderId;
        
        // Show existing photos from JSON immediately while we verify live
        if (PHOTOS) {
            // Map JSON structure to livePhotos structure
            const initialLive = {};
            Object.entries(PHOTOS).forEach(([key, val]) => {
                if (val && val.view) {
                    initialLive[key] = {
                        thumbnail: val.thumbnail,
                        view: val.view
                    };
                }
            });
            if (Object.keys(initialLive).length > 0) {
                setLivePhotos(initialLive);
            }
        }

        // In Supervisor mode, if we don't have a folderId yet, find it
        if (driveMode === 'SUPERVISOR' && !resolvedFolderId && accessToken && FOLIO) {
            setIsVerifying(true);
            setVerificationStatus('verifying');
            resolvedFolderId = await findSupervisorFolder(String(FOLIO).trim());
            if (!resolvedFolderId) {
                if (onFolioSync) onFolioSync(FOLIO, null, "NO ENCONTRADO (SUP.)", 0, []);
                setIsVerifying(false);
                setCurrentFolderId(null);
                setVerificationStatus('error');
                return;
            }
        }

        setCurrentFolderId(resolvedFolderId);

        if (!resolvedFolderId) {
            if (onFolioSync) onFolioSync(FOLIO, null, "SIN CARPETA", 0, []);
            setVerificationStatus('error');
            return;
        }
        let status = "";
        let currentFoundPhotos = null;
        let currentExtrasCount = 0;
        if (!accessToken) {
            console.log("No auth token, bypassing direct live verification");
            return;
        }

        setIsVerifying(true);
        try {
            const query = encodeURIComponent(`'${resolvedFolderId}' in parents and trashed = false`);
            const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,webViewLink,thumbnailLink)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100`;
            const driveRes = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken }});
            
            if (driveRes.status === 401) {
                setAccessToken(null);
                localStorage.removeItem('drive_access_token');
                throw new Error("Token expirado, vuelve a conectar Tu Google.");
            }
            if (!driveRes.ok) throw new Error(await driveRes.text());

            const resData = await driveRes.json();
            const files = resData.files || [];
            
            let currentStatus = "";
            let extraFilesCount = 0;
            let currentFoundPhotos = null;
            let liveFaltanNEOList = [];

            if (files.length === 0) {
                currentStatus = "CARPETA VAC\u00cdA";
                setExtraFiles([]);
                setLivePhotos(null);
                setIsNewSet(!isLegacyDate(FECHA) && (_isNewSet === true));
            } else {
                currentFoundPhotos = {};
                const recognizedIds = new Set();
                const newSuffixes = ['_folio', '_corte', '_demolicion', '_liga', '_mezcla', '_limpieza'];
                let detectedNew = !isLegacyDate(FECHA) && (_isNewSet === true);

                if (!detectedNew && !isLegacyDate(FECHA)) {
                    // Check for new suffixes to determine if we use the 9-photo set
                    for (const f of files) {
                        const lowerName = f.name.toLowerCase();
                        if (newSuffixes.some(s => lowerName.includes(s))) {
                            detectedNew = true;
                            break;
                        }
                    }
                }
                
                setIsNewSet(detectedNew);
                const currentSet = detectedNew ? CONFIG_FOTOS.NEW : CONFIG_FOTOS.LEGACY;

                for (const f of files) {
                    const lowerName = f.name.toLowerCase();
                    for (const cat of currentSet) {
                        if (lowerName.includes(cat.pattern)) {
                            recognizedIds.add(f.id);
                            if (!currentFoundPhotos[cat.id]) {
                                currentFoundPhotos[cat.id] = {
                                    id: f.id,
                                    thumbnail: f.thumbnailLink,
                                    view: f.webViewLink
                                };
                            }
                        }
                    }
                }

                setLivePhotos(currentFoundPhotos);

                currentStatus = "";
                liveFaltanNEOList = [];

                if (detectedNew) {
                    const criticalSet = ['INICIAL', 'CAJA', 'TERMINADO'];
                    const neoSet = ['FOLIO', 'CORTE', 'DEMOLICION', 'LIGA', 'MEZCLA', 'LIMPIEZA'];
                    
                    const missingCritical = criticalSet.filter(catId => !currentFoundPhotos[catId]);
                    const missingNeo = neoSet.filter(catId => !currentFoundPhotos[catId]);
                    
                    if (missingCritical.length > 0) {
                        currentStatus = "FALTA: " + missingCritical.join(" + ");
                    } else {
                        currentStatus = "OK";
                        liveFaltanNEOList = missingNeo;
                    }
                } else {
                    const legacySet = ['INICIAL', 'CAJA', 'TERMINADO'];
                    const missingLegacy = legacySet.filter(catId => !currentFoundPhotos[catId]);
                    
                    if (missingLegacy.length > 0) {
                        currentStatus = "FALTA: " + missingLegacy.join(" + ");
                    } else {
                        currentStatus = "OK";
                    }
                }

                setLiveFaltanNEO(liveFaltanNEOList);

                // Collect unrecognized files
                const extras = files.filter(f => !recognizedIds.has(f.id));
                setExtraFiles(extras);
                currentExtrasCount = extras.length;
                extraFilesCount = extras.length;
            }

            if (onFolioSync) {
                onFolioSync(FOLIO, currentFoundPhotos, currentStatus, extraFilesCount, liveFaltanNEOList);
                
                // --- SELF-HEALING ---
                // Si el estatus en vivo es diferente al que tenía el JSON original del servidor,
                // avisamos al servidor para que re-audite este folio y actualice a todos los usuarios.
                if (currentStatus !== RESULTADO_AUDITORIA) {
                    console.log(`[Self-Healing] 🩺 Discrepancia detectada en Folio ${FOLIO}. Notificando...`);
                    
                    // 1. Notificar al servidor local (para persistencia en archivos JSON)
                    fetch('http://localhost:3001/api/recheck-folio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folio: FOLIO, stage: _stage })
                    }).catch(() => console.log("Servidor local offline."));

                    // 2. Actualizar Firebase Firestore (para sincronización global inmediata)
                    try {
                        const folioKey = `${_stage}_${_company || 'DESCONOCIDA'}_${ID || 'SIN_ID'}_${FOLIO}`;
                        await setDoc(doc(firestoreDb, "audit_results", folioKey), {
                            status: currentStatus,
                            last_verified: serverTimestamp(),
                            folio: FOLIO,
                            stage: _stage,
                            empresa: _company || 'DESCONOCIDA',
                            contrato: ID || 'SIN_ID',
                            photos: Object.keys(currentFoundPhotos).map(k => ({ 
                                id: currentFoundPhotos[k].id, 
                                cat: k 
                            })),
                            faltanNEO: liveFaltanNEOList
                        }, { merge: true });
                        console.log("🔥 Firebase actualizado en tiempo real");
                    } catch (fsErr) {
                        console.error("❌ Error actualizando Firebase:", fsErr);
                    }
                }
            }
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

    const handleRename = async (fileId, newName) => {
        if (!accessToken) {
            alert('Debes Iniciar Sesi\u00f3n con Google primero.');
            return;
        }
        setRenamingId(fileId);
        try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: newName })
            });
            if (!res.ok) throw new Error(await res.text());
            console.log(`\u270f\ufe0f Renombrado exitoso: ${newName}`);
            await logToSheet('RENOMBRADO', FOLIO, newName, fileId);
            setEditingFile(null);
            await triggerVerification();
        } catch (err) {
            alert(`Error al renombrar: ${err.message}`);
        }
        setRenamingId(null);
    };

    const getQuickRenameOptions = (fileName) => {
        const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '.jpg';
        const options = [];
        const currentSet = isNewSet ? CONFIG_FOTOS.NEW : CONFIG_FOTOS.LEGACY;
        
        for (const cat of currentSet) {
            const hasPhoto = livePhotos ? livePhotos[cat.id] : PHOTOS?.[cat.id];
            if (!hasPhoto) {
                options.push({ label: cat.label.replace(/^\d\.\s/, ''), newName: `${FOLIO}${cat.pattern}${ext}` });
            }
        }
        return options;
    };

    useEffect(() => {
        if (isOpen && accessToken) {
            // In admin mode, require _folderId. In supervisor mode, search dynamically.
            if (driveMode === 'ADMIN' && _folderId) {
                triggerVerification();
            } else if (driveMode === 'SUPERVISOR' && FOLIO) {
                triggerVerification();
            }
        }
        if (!isOpen) {
            setExtraFiles([]);
            setEditingFile(null);
        }
    }, [isOpen, _folderId, accessToken, driveMode, FOLIO]);

    if (!isOpen || !folioData) return null;

    const getModalDisplayStatus = () => {
        if (isLegacyDate(FECHA)) return RESULTADO_AUDITORIA || 'N/A';
        if (RESULTADO_AUDITORIA === 'OK' && liveFaltanNEO && liveFaltanNEO.length > 0) {
            const friendlyList = liveFaltanNEO.map(f => FOTO_LABELS[f.toUpperCase()] || f);
            return `OK Parcial - Falta: ${friendlyList.join(', ')}`;
        }
        return RESULTADO_AUDITORIA || 'N/A';
    };

    const displayStatus = getModalDisplayStatus();
    const isOkParcial = displayStatus.startsWith('OK Parcial');
    const isOk = displayStatus === 'OK';
    
    let badgeClass = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800/30';
    if (isOk) {
        badgeClass = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800/30';
    } else if (isOkParcial) {
        badgeClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/30';
    }

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
                                {isAuthorizedEditor && (
                                    <span className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 text-white text-[10px] font-black rounded-full shadow-lg shadow-blue-500/20 border border-blue-400">
                                        <Check size={12} strokeWidth={4} />
                                        CUENTA VERIFICADA
                                    </span>
                                )}
                                <span className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-black rounded-full border shadow-sm ${
                                    isNewSet 
                                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' 
                                        : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700'
                                }`}>
                                    {isNewSet ? (
                                        <><FileImage size={12} /> Neo</>
                                    ) : (
                                        <><Clock size={12} /> Legacy</>
                                    )}
                                </span>
                                <span className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-black rounded-full border shadow-sm ${
                                    driveMode === 'ADMIN'
                                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700'
                                        : 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700'
                                }`}>
                                    {driveMode === 'ADMIN' ? '📁 DRIVE ADMIN' : '📂 DRIVE SUPERVISORES'}
                                </span>
                                {(_folderId || currentFolderId) && (
                                    <a
                                        href={`https://drive.google.com/drive/folders/${_folderId || currentFolderId}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-full border border-indigo-300 dark:border-indigo-700 transition-colors shadow-sm"
                                        title="Abrir carpeta del folio en Google Drive"
                                    >
                                        <FolderOpen size={12} />
                                        VER EN DRIVE
                                    </a>
                                )}

                                <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${badgeClass}`}>
                                        {displayStatus}
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

                            {/* Banner de Cuenta de Subida (Supervisores) */}
                            {folioData?._uploadEmail && (
                                <div className="mt-3 flex items-center gap-2.5 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                        <FileIcon size={16} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-wider leading-none mb-1">Cuenta oficial de subida</p>
                                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-300 flex items-center gap-1.5">
                                            {folioData._uploadEmail}
                                            <span className="px-1.5 py-0.5 bg-indigo-200 dark:bg-indigo-700 text-[9px] rounded font-black text-indigo-800 dark:text-indigo-200">SUPERVISORES</span>
                                        </p>
                                    </div>
                                </div>
                            )}
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
                                <div className="flex items-center gap-3">
                                    {userProfile && (
                                        <div className="hidden sm:flex items-center gap-2 mr-1 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                            <img src={userProfile.picture} alt="" className="w-5 h-5 rounded-full border border-slate-300" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] leading-none font-black text-slate-700 dark:text-slate-200 uppercase tracking-tighter">{userProfile.name}</span>
                                                <span className="text-[9px] leading-none text-slate-400 font-mono">{userProfile.email}</span>
                                            </div>
                                        </div>
                                    )}
                                    <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full flex items-center gap-2 border border-green-200 shadow-sm">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> Conectado
                                    </span>
                                </div>
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
                        <div className={`grid gap-4 ${isNewSet ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-3 gap-6'}`}>
                            {(isNewSet ? CONFIG_FOTOS.NEW : CONFIG_FOTOS.LEGACY).map(cat => {
                                const photoObj = livePhotos ? livePhotos[cat.id] : PHOTOS?.[cat.id];
                                return (
                                    <PhotoCard 
                                        key={cat.id}
                                        title={cat.label} 
                                        photoObj={photoObj} 
                                        folio={FOLIO} 
                                        folderId={currentFolderId} 
                                        stage={_stage} 
                                        internalCategoryName={cat.id} 
                                        onActionSuccess={triggerVerification} 
                                        isVerifying={isVerifying} 
                                        accessToken={accessToken} 
                                        logToSheet={logToSheet} 
                                        isEditable={isAuthorizedEditor} 
                                    />
                                );
                            })}
                        </div>

                        {/* Folder Explorer */}
                        {accessToken && currentFolderId && (
                            <div className="mt-8">
                                <div className="flex items-center gap-2 mb-4">
                                    <FolderOpen size={18} className="text-slate-500" />
                                    <h4 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Explorador de Carpeta</h4>
                                    <span className="text-xs text-slate-400 font-medium ml-1">({extraFiles.length} archivo{extraFiles.length !== 1 ? 's' : ''} sin clasificar)</span>
                                </div>

                                {isVerifying && extraFiles.length === 0 ? (
                                    <div className="flex items-center gap-2 justify-center py-6 text-slate-400">
                                        <Loader2 size={16} className="animate-spin" />
                                        <span className="text-sm font-medium">Escaneando carpeta...</span>
                                    </div>
                                ) : extraFiles.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                        <FolderOpen size={32} className="text-slate-300 dark:text-slate-600 mb-2" />
                                        <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Sin archivos adicionales</p>
                                        <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">Todos los archivos están correctamente clasificados</p>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                        {extraFiles.map((file, idx) => {
                                            const isImage = file.mimeType?.startsWith('image/');
                                            const isCurrentlyRenaming = renamingId === file.id;
                                            const isEditing = editingFile?.id === file.id;
                                            const quickOptions = getQuickRenameOptions(file.name);
                                            const thumbUrl = file.thumbnailLink || (isImage ? `https://drive.google.com/thumbnail?id=${file.id}&sz=w120` : null);

                                            return (
                                                <div
                                                    key={file.id}
                                                    className={`flex items-center gap-4 px-4 py-3 transition-colors
                                                        ${idx !== extraFiles.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''}
                                                        ${isCurrentlyRenaming ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                                                >
                                                    {/* Thumbnail */}
                                                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                                                        {thumbUrl ? (
                                                            <img
                                                                src={thumbUrl}
                                                                alt={file.name}
                                                                referrerPolicy="no-referrer"
                                                                className="w-full h-full object-cover"
                                                                onError={(e) => {
                                                                    e.target.style.display = 'none';
                                                                    e.target.parentNode.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
                                                                }}
                                                            />
                                                        ) : (
                                                            <FileIcon size={20} className="text-slate-400" />
                                                        )}
                                                    </div>

                                                    {/* File name / Edit field */}
                                                    <div className="flex-1 min-w-0">
                                                        {isEditing ? (
                                                            <div className="flex items-center gap-2">
                                                                 <input
                                                                    type="text"
                                                                    value={editingFile.name}
                                                                    onChange={(e) => setEditingFile({ ...editingFile, name: e.target.value })}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') handleRename(file.id, editingFile.name);
                                                                        if (e.key === 'Escape') setEditingFile(null);
                                                                    }}
                                                                    className="flex-1 text-sm px-3 py-1.5 border border-primary/40 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                                                                    autoFocus
                                                                />
                                                                <button
                                                                    onClick={() => handleRename(file.id, editingFile.name)}
                                                                    disabled={isCurrentlyRenaming}
                                                                    className="p-1.5 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 rounded-lg text-green-600 transition-colors disabled:opacity-50"
                                                                    title="Confirmar"
                                                                >
                                                                    {isCurrentlyRenaming ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingFile(null)}
                                                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded-lg text-slate-500 transition-colors"
                                                                    title="Cancelar"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate" title={file.name}>
                                                                {file.name}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Actions */}
                                                    {!isEditing && (
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {/* Quick rename buttons - Restricted to Authorized Editors */}
                                                            {isAuthorizedEditor && quickOptions.map(opt => (
                                                                <button
                                                                    key={opt.label}
                                                                    onClick={() => handleRename(file.id, opt.newName)}
                                                                    disabled={isCurrentlyRenaming}
                                                                    className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-primary/30 text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-50"
                                                                    title={`Renombrar a ${opt.newName}`}
                                                                >
                                                                    {isCurrentlyRenaming ? <Loader2 size={10} className="animate-spin" /> : opt.label}
                                                                </button>
                                                            ))}
                                                            {/* Manual edit - Restricted to Authorized Editors */}
                                                            {isAuthorizedEditor && (
                                                                <button
                                                                    onClick={() => setEditingFile({ id: file.id, name: file.name })}
                                                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-500 dark:text-slate-400 transition-colors"
                                                                    title="Editar nombre manualmente"
                                                                >
                                                                    <Pencil size={14} />
                                                                </button>
                                                            )}
                                                            {/* Open in Drive */}
                                                            <a
                                                                href={file.webViewLink}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-500 dark:text-slate-400 transition-colors"
                                                                title="Abrir en Drive"
                                                            >
                                                                <ExternalLink size={14} />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}