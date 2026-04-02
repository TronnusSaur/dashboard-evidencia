import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Image as ImageIcon, AlertTriangle, Loader2, Trash2, RefreshCw } from 'lucide-react';

const PhotoCard = ({ title, photoObj, folio, folderId, internalCategoryName, onActionSuccess, stage, isVerifying }) => {
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const getDriveId = (url) => {
        const match = url?.match(/\/d\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null; 
    };

    const driveId = photoObj?.id || getDriveId(photoObj?.view);
    const stableImageSrc = driveId 
        ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w800` 
        : (photoObj?.thumbnail ? photoObj.thumbnail.replace('=s220', '=s800') : '');

    const handleDragOver = (e) => {
        e.preventDefault();
        if(!stableImageSrc) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        if(stableImageSrc || isUploading || isDeleting || isVerifying) return;

        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        if (!folderId) {
            alert('El folio fue catalogado como SIN CARPETA. Crea la carpeta primero en Drive y actualiza el Dashboard.');
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folio', folio);
        formData.append('type', internalCategoryName);
        formData.append('folderId', folderId);
        formData.append('stage', stage || 'E2');
        formData.append('user', 'Dashboard Admin');

        try {
            const res = await fetch('http://localhost:3001/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setIsImageLoading(true);
                if (onActionSuccess) onActionSuccess();
            } else if (data.requiresAuth || data.error === 'NO_TOKEN') {
                alert('Falta autenticación OAuth2. Se abrirá una pestaña para que autorices a la aplicación.');
                window.open(data.authUrl || 'http://localhost:3001/auth', '_blank');
            } else {
                alert(`Error al subir: ${data.error}`);
            }
        } catch (err) {
            alert(`Error de conexión con el Micro-Servidor: ${err.message}`);
        }
        setIsUploading(false);
    };

    const handleDelete = async () => {
        if (!confirm(`¿Estás seguro de que quieres eliminar la evidencia ${title} de Google Drive?`)) return;
        setIsDeleting(true);
        try {
            const res = await fetch('http://localhost:3001/api/delete-evidence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId, type: internalCategoryName, folio, stage: stage || 'E2', user: 'Dashboard Admin' })
            });
            const data = await res.json();
            if (data.success) {
                if (onActionSuccess) onActionSuccess();
            } else if (data.requiresAuth || data.error === 'NO_TOKEN') {
                alert('Falta autenticación OAuth2. Visita http://localhost:3001/auth');
                window.open('http://localhost:3001/auth', '_blank');
            } else {
                alert(`Error al eliminar: ${data.error}`);
            }
        } catch (err) {
            alert(`Error de conexión con el Micro-Servidor: ${err.message}`);
        }
        setIsDeleting(false);
    };

    if (!stableImageSrc) {
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
                        disabled={isDeleting || isVerifying}
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
                {isImageLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 z-0">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Cargando...</span>
                    </div>
                )}
                <img 
                    src={stableImageSrc} 
                    alt={`Evidencia ${title}`}
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-cover transition-opacity duration-500 relative z-10 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
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
    
    // We want to fetch truth immediately on open
    const { FOLIO, CALLE, COLONIA, RESULTADO_AUDITORIA, PHOTOS, _folderId, _stage } = folioData || {};

    const triggerVerification = async () => {
        if (!_folderId) return;
        setIsVerifying(true);
        try {
            const res = await fetch(`http://localhost:3001/api/verify-folio?folderId=${_folderId}`);
            const data = await res.json();
            if (data.success) {
                if (onFolioSync) onFolioSync(FOLIO, data.photos, data.status);
            }
        } catch (error) {
            console.error(error);
        }
        setIsVerifying(false);
    };

    useEffect(() => {
        if (isOpen && _folderId) {
            triggerVerification();
        }
    }, [isOpen, _folderId]);

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
                        <button 
                            onClick={onClose}
                            className="p-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-600 dark:text-slate-300"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <PhotoCard title="Inicial (Bache)" photoObj={PHOTOS?.INICIAL} folio={FOLIO} folderId={_folderId} stage={_stage} internalCategoryName="INICIAL" onActionSuccess={triggerVerification} isVerifying={isVerifying} />
                            <PhotoCard title="Caja (Fresado)" photoObj={PHOTOS?.CAJA} folio={FOLIO} folderId={_folderId} stage={_stage} internalCategoryName="CAJA" onActionSuccess={triggerVerification} isVerifying={isVerifying} />
                            <PhotoCard title="Terminado" photoObj={PHOTOS?.FINAL} folio={FOLIO} folderId={_folderId} stage={_stage} internalCategoryName="FINAL" onActionSuccess={triggerVerification} isVerifying={isVerifying} />
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
