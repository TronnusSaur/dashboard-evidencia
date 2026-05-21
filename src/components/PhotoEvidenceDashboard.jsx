import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
    LayoutDashboard, AlertTriangle, Filter, Table as TableIcon,
    PieChart as PieIcon, BarChart3, ArrowRight, ChevronDown,
    MapPin, AlertCircle, FileText, AlertOctagon
} from 'lucide-react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { FILTERS_MAP, ERROR_TYPES, RESUMEN_DATA, GLOBAL_TOTALS } from '../dataMock';
import FolioVisualizerModal from './FolioVisualizerModal';
import { collection, onSnapshot, query, where, limit } from "firebase/firestore";
import { db as firestoreDb } from "../lib/firebase";

// ── Animated Counter Component ──────────────────────────────────────────────
// Provides a smooth "ticker" animation when KPI values change between drives
const AnimatedCounter = ({ value, duration = 600 }) => {
    const [displayValue, setDisplayValue] = React.useState(value);
    const previousValue = React.useRef(value);

    React.useEffect(() => {
        const from = previousValue.current;
        const to = value;
        previousValue.current = value;

        if (from === to) {
            setDisplayValue(to);
            return;
        }

        const startTime = performance.now();
        const diff = to - from;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic for a satisfying deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(from + diff * eased);
            setDisplayValue(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value, duration]);

    return displayValue.toLocaleString();
};

const getColorForStatus = (status) => {
    if (!status) return '#64748b'; // Default Slate
    const s = status.toUpperCase();
    if (s.startsWith('OK PARCIAL')) return '#4ade80'; // Lighter green for OK Parcial
    if (s === 'FALTANTES MULTIPLES') return '#be123c'; // Rose-700 (Muy Crítico)
    if (s.includes('TERMINADO')) return '#ef4444'; // Red (Crítico)
    if (s.includes('INICIAL') || s.includes('CAJA')) return '#f97316'; // Orange (Advertencia)
    if (s === 'OK') return '#22c55e'; // Green
    if (s === 'SIN CARPETA') return '#eab308'; // Yellow
    if (s === 'CARPETA VACÍA') return '#d97706'; // Amber
    return '#8b5cf6'; // Purple fallback
};

const FOTO_LABELS = {
    'FOLIO': 'Folio',
    'CORTE': 'Corte',
    'DEMOLICION': 'Demolición',
    'LIGA': 'Liga',
    'MEZCLA': 'Mezcla',
    'LIMPIEZA': 'Limpieza'
};

const getDisplayStatus = (row) => {
    if (!row) return 'N/A';
    if (row.RESULTADO_AUDITORIA === 'OK' && row._faltanNEO && row._faltanNEO.length > 0) {
        const friendlyList = row._faltanNEO.map(f => FOTO_LABELS[f.toUpperCase()] || f);
        return `OK Parcial - Falta: ${friendlyList.join(', ')}`;
    }
    return row.RESULTADO_AUDITORIA || 'N/A';
};

// Option B Grouping Logic
const CONDENSED_CATEGORIES = [];
const MAP_TO_CONDENSED = {};

ERROR_TYPES.forEach(type => {
    if (type.includes('+') || type.includes(' Y ')) {
        MAP_TO_CONDENSED[type] = 'FALTANTES MULTIPLES';
        if (!CONDENSED_CATEGORIES.includes('FALTANTES MULTIPLES')) {
            CONDENSED_CATEGORIES.push('FALTANTES MULTIPLES');
        }
    } else {
        MAP_TO_CONDENSED[type] = type;
        if (!CONDENSED_CATEGORIES.includes(type)) {
            CONDENSED_CATEGORIES.push(type);
        }
    }
});

// Module-level cache: persists across renders and stage switches without losing data.
// Key = `${driveMode}_${stage}` (e.g. 'ADMIN_E1', 'SUPERVISOR_E3_SUP'), Value = array of record objects.
const stageCache = {};

const PhotoEvidenceDashboard = () => {
    const [selectedStage, setSelectedStage] = useState('E3'); // Default to Stage 3
    const [selectedCompany, setSelectedCompany] = useState('ALL');
    const [selectedContract, setSelectedContract] = useState('ALL');
    const [selectedDelegation, setSelectedDelegation] = useState('ALL');
    const [selectedErrorTypes, setSelectedErrorTypes] = useState([]);
    const [showAlert, setShowAlert] = useState(false);
    const [selectedVisualizerFolio, setSelectedVisualizerFolio] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showOkFolios, setShowOkFolios] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [isZipping, setIsZipping] = useState(false);

    // Multi-Drive State
    const ADMIN_EMAILS = ["dgopbacheot@gmail.com", "juanpablobumblebee@gmail.com", "soranoautodgop@gmail.com", "soranodex@gmail.com"];
    const [driveMode, setDriveMode] = useState(() => localStorage.getItem('drive_mode') || 'ADMIN');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, stage: '' });
    const [syncLog, setSyncLog] = useState('');
    const loggedInProfile = useMemo(() => {
        try { return JSON.parse(localStorage.getItem('google_user_profile') || 'null'); } catch { return null; }
    }, []);
    const isAdmin = loggedInProfile && ADMIN_EMAILS.includes(loggedInProfile.email);

    useEffect(() => { localStorage.setItem('drive_mode', driveMode); }, [driveMode]);

    // Filter RESUMEN_DATA by stage AND drive mode
    // When viewing E3 in SUPERVISOR mode, we use E3_SUP entries from RESUMEN_DATA
    const activeResumen = useMemo(() => {
        if (selectedStage === 'ALL') {
            if (driveMode === 'SUPERVISOR') {
                // Replace E3 entries with E3_SUP entries
                return RESUMEN_DATA.filter(r => r._stage !== 'E3');
            }
            return RESUMEN_DATA.filter(r => r._stage !== 'E3_SUP');
        }
        if (selectedStage === 'E3') {
            return RESUMEN_DATA.filter(r => r._stage === (driveMode === 'SUPERVISOR' ? 'E3_SUP' : 'E3'));
        }
        return RESUMEN_DATA.filter(r => r._stage === selectedStage);
    }, [selectedStage, driveMode]);

    // Derived filters map from activeResumen
    const activeFiltersMap = useMemo(() => {
        const map = {};
        activeResumen.forEach(r => {
            if (!map[r.EMPRESA_RAIZ_MASTER]) map[r.EMPRESA_RAIZ_MASTER] = [];
            if (!map[r.EMPRESA_RAIZ_MASTER].includes(r.ID)) map[r.EMPRESA_RAIZ_MASTER].push(r.ID);
        });
        return map;
    }, [activeResumen]);

    // Lazy Loading States
    const [records, setRecords] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Theme State
    const [isDarkMode, setIsDarkMode] = useState(false);
    useEffect(() => {
        if (isDarkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [isDarkMode]);

    // Limpiar caché local al inicio para forzar sincronización pura con Firestore
    useEffect(() => {
        localStorage.removeItem('optimistic_folios');
    }, []);

    const companies = useMemo(() => {
        if (selectedDelegation === 'ALL') return ['ALL', ...Object.keys(activeFiltersMap).sort()];
        const unique = new Set(records.filter(r => r.DELEGACION === selectedDelegation).map(r => r._company).filter(Boolean));
        return ['ALL', ...Array.from(unique).sort()];
    }, [records, selectedDelegation, activeFiltersMap]);

    const contracts = useMemo(() => {
        if (selectedCompany === 'ALL') return ['ALL'];
        return ['ALL', ...(activeFiltersMap[selectedCompany] || [])];
    }, [selectedCompany, activeFiltersMap]);

    const delegations = useMemo(() => {
        const unique = new Set(records.map(r => r.DELEGACION).filter(Boolean));
        return ['ALL', ...Array.from(unique).sort()];
    }, [records]);

    useEffect(() => {
        if (!isLoading && selectedDelegation !== 'ALL' && delegations.length > 0 && !delegations.includes(selectedDelegation)) {
            setSelectedDelegation('ALL');
        }
    }, [delegations, selectedDelegation, isLoading]);

    const filteredRecords = useMemo(() => {
        let filtered = records;

        if (selectedStage !== 'ALL') {
            filtered = filtered.filter(r => r._stage === selectedStage);
        }

        if (selectedCompany !== 'ALL') {
            filtered = filtered.filter(r => r._company === selectedCompany);
        }

        if (selectedContract !== 'ALL') {
            filtered = filtered.filter(r => String(r.ID) === String(selectedContract) || String(r._contract) === String(selectedContract));
        }

        if (selectedDelegation !== 'ALL') {
            filtered = filtered.filter(r => r.DELEGACION === selectedDelegation);
        }

        // NOTE: OK filter is intentionally NOT applied here.
        // It is applied in tableData so that search queries can still find OK folios.
        return filtered;
    }, [records, selectedStage, selectedCompany, selectedContract, selectedDelegation]);

    const kpiData = useMemo(() => {
        let sinCarpeta = 0, faltaInicial = 0, faltaCaja = 0, faltaTerminado = 0, ok = 0, okTotal = 0;
        let faltaFolio = 0, faltaCorte = 0, faltaDemolicion = 0, faltaLiga = 0, faltaMezcla = 0, faltaLimpieza = 0;

        filteredRecords.forEach(row => {
            const rawType = row.RESULTADO_AUDITORIA || '';
            if (rawType === 'OK') {
                ok++;
                if (!row._faltanNEO || row._faltanNEO.length === 0) {
                    okTotal++;
                }
                return;
            }

            if (rawType.includes('SIN CARPETA') || rawType.includes('CARPETA VACÍA')) {
                sinCarpeta++;
            } else {
                if (rawType.includes('INICIAL')) faltaInicial++;
                if (rawType.includes('CAJA')) faltaCaja++;
                if (rawType.includes('TERMINADO')) faltaTerminado++;
                if (rawType.includes('FOLIO')) faltaFolio++;
                if (rawType.includes('CORTE')) faltaCorte++;
                if (rawType.includes('DEMOLICION')) faltaDemolicion++;
                if (rawType.includes('LIGA')) faltaLiga++;
                if (rawType.includes('MEZCLA')) faltaMezcla++;
                if (rawType.includes('LIMPIEZA')) faltaLimpieza++;
            }
        });

        // Sumamos las incidencias para que el Total sea la suma exacta de las tarjetas siguientes
        let total = sinCarpeta + faltaInicial + faltaCaja + faltaTerminado + faltaFolio + faltaCorte + faltaDemolicion + faltaLiga + faltaMezcla + faltaLimpieza;

        return { 
            total, sinCarpeta, ok, okTotal,
            faltaInicial, faltaCaja, faltaTerminado, 
            faltaFolio, faltaCorte, faltaDemolicion, 
            faltaLiga, faltaMezcla, faltaLimpieza 
        };
    }, [filteredRecords]);

    // Handle stage change
    const handleStageChange = (stage) => {
        setSelectedStage(stage);
        setSelectedCompany('ALL');
        setSelectedContract('ALL');
        setSelectedErrorTypes([]);
    };

    // Handle company change to reset contract and error type
    const handleCompanyChange = (company) => {
        setSelectedCompany(company);
        setSelectedContract('ALL');
        setSelectedErrorTypes([]);
    };

    const toggleErrorType = (type) => {
        if (type === 'ALL') {
            setSelectedErrorTypes([]);
            return;
        }
        setSelectedErrorTypes(prev =>
            prev.includes(type)
                ? prev.filter(t => t !== type)
                : [...prev, type]
        );
    };

    // Contract Progress Data (Template vs OK)
    const contractStats = useMemo(() => {
        const stats = {};
        
        activeResumen.forEach(res => {
            const cid = res.ID || "Sin Contrato";
            if (selectedCompany !== 'ALL' && res.EMPRESA_RAIZ_MASTER !== selectedCompany) return;
            if (selectedContract !== 'ALL' && cid !== selectedContract) return;

            if (!stats[cid]) stats[cid] = { company: res.EMPRESA_RAIZ_MASTER, totalTemplate: 0, ok: 0 };
            stats[cid].totalTemplate += (res.TOTAL_OMISIONES || 0);
        });

        filteredRecords.forEach(r => {
            const cid = r.ID || r._contract || "Sin Contrato";
            if (stats[cid] && r.RESULTADO_AUDITORIA === 'OK') {
                stats[cid].ok++;
            }
        });

        return Object.keys(stats).map(cid => {
            const total = stats[cid].totalTemplate;
            const ok = stats[cid].ok;
            const pct = total > 0 ? Math.round((ok / total) * 100) : 0;
            return {
                name: `C-${cid}`,
                company: stats[cid].company,
                total,
                ok,
                pct,
                fill: pct >= 90 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444'
            };
        }).sort((a,b) => b.pct - a.pct);
    }, [filteredRecords, activeResumen, selectedCompany, selectedContract]);

    // Bar Chart Data
    const barData = useMemo(() => {
        if (selectedContract !== 'ALL') {
            // Desglose del contrato específico
            const sums = {};
            CONDENSED_CATEGORIES.forEach(type => sums[type] = 0);
            filteredRecords.forEach(row => {
                const rawType = row.RESULTADO_AUDITORIA || '';
                const condensed = MAP_TO_CONDENSED[rawType];
                if (condensed) sums[condensed]++;
            });
            return CONDENSED_CATEGORIES.map(type => ({
                name: type,
                value: sums[type],
                color: getColorForStatus(type)
            }));
        } else if (selectedCompany !== 'ALL') {
            // Comparativa de errores por contrato de la empresa
            const contractSums = {};
            filteredRecords.forEach(row => {
                const rawType = row.RESULTADO_AUDITORIA || '';
                const condensed = MAP_TO_CONDENSED[rawType];
                const cid = row.ID || row._contract;
                if (condensed && cid && condensed !== 'OK') {
                    contractSums[cid] = (contractSums[cid] || 0) + 1;
                }
            });
            return Object.keys(contractSums).map(contractId => ({
                name: `C-${contractId}`,
                value: contractSums[contractId],
                color: '#8b5cf6' // Purple for contract comparison
            }));
        } else {
            // General por tipos
            const sums = {};
            CONDENSED_CATEGORIES.forEach(type => sums[type] = 0);
            filteredRecords.forEach(row => {
                const rawType = row.RESULTADO_AUDITORIA || '';
                const condensed = MAP_TO_CONDENSED[rawType];
                if (condensed) sums[condensed]++;
            });
            return CONDENSED_CATEGORIES.map(type => ({
                name: type,
                value: sums[type],
                color: getColorForStatus(type)
            }));
        }
    }, [selectedCompany, selectedContract, filteredRecords]);

    // Table Data (Drill-down)
    // Lazy Loading Effect
    useEffect(() => {
        const fetchRecords = async () => {
            const isSup = driveMode === 'SUPERVISOR';
            const stagesToFetch = selectedStage === 'ALL' 
                ? (isSup ? ['E1', 'E2', 'E3_SUP'] : ['E1', 'E2', 'E3']) 
                : (selectedStage === 'E3' && isSup ? ['E3_SUP'] : [selectedStage]);

            // Build cache keys that are mode-aware
            const cacheKeys = stagesToFetch.map(st => `${driveMode}_${st}`);

            // Check if all needed data is already cached
            const allCached = cacheKeys.every(ck => stageCache[ck]);
            if (allCached) {
                const cachedRecords = cacheKeys.flatMap(ck => stageCache[ck]);
                setRecords(cachedRecords);
                return;
            }

            const stagesToDownload = stagesToFetch.filter((st, i) => !stageCache[cacheKeys[i]]);
            setIsLoading(true);
            setLoadingMessage(`Cargando datos (${driveMode === 'SUPERVISOR' ? 'Drive Supervisores' : 'Drive Admin'})...`);

            try {
                const downloadPromises = stagesToDownload.map(st => {
                    const ck = `${driveMode}_${st}`;
                    return fetch(`/contratos/${st}_Master.json?t=${Date.now()}`)
                        .then(res => res.ok ? res.json() : [])
                        .then(data => { 
                            // Normalizar _stage a 'E3' para compatibilidad con UI filters
                            const normalized = data.map(r => ({ ...r, _stage: st.startsWith('E3') ? 'E3' : st }));
                            stageCache[ck] = normalized; 
                            return normalized; 
                        })
                        .catch(() => { stageCache[ck] = []; return []; });
                });

                await Promise.all(downloadPromises);
                let allRecords = cacheKeys.flatMap(ck => stageCache[ck] || []);

                setRecords(allRecords);
            } catch (error) {
                console.error("Fetch error:", error);
                setRecords([]);
            } finally {
                setIsLoading(false);
                setLoadingMessage('');
            }
        };

        fetchRecords();

        // Pre-fetch the alternative drive's E3 data in the background
        // so the next switch is instant
        const altMode = driveMode === 'ADMIN' ? 'SUPERVISOR' : 'ADMIN';
        const altStage = altMode === 'SUPERVISOR' ? 'E3_SUP' : 'E3';
        const altCk = `${altMode}_${altStage}`;
        if (!stageCache[altCk] && (selectedStage === 'E3' || selectedStage === 'ALL')) {
            fetch(`/contratos/${altStage}_Master.json?t=${Date.now()}`)
                .then(res => res.ok ? res.json() : [])
                .then(data => {
                    stageCache[altCk] = data.map(r => ({ ...r, _stage: 'E3' }));
                })
                .catch(() => {});
        }
    }, [selectedStage, driveMode]); // Refresh on mode change too!
    
    // --- REAL-TIME FIRESTORE LISTENER ---
    // Listen for overrides/updates from anyone in the cloud
    useEffect(() => {
        const q = query(collection(firestoreDb, "audit_results"), limit(500)); // Listen for latest 500 overrides
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (snapshot.empty) return;
            
            // 1. Primero actualizamos el cache global (stageCache) para que los cambios 
            // persistan si el usuario cambia de modo (Admin/Supervisores)
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                const folioId = String(data.folio);
                
                // Buscamos el folio en todas las etapas/modos cacheados
                Object.keys(stageCache).forEach(cacheKey => {
                    const cacheItems = stageCache[cacheKey];
                    if (!cacheItems || !Array.isArray(cacheItems)) return;
                    
                    const folioIndex = cacheItems.findIndex(r => String(r.FOLIO) === folioId);
                    
                    if (folioIndex !== -1) {
                        cacheItems[folioIndex] = { 
                            ...cacheItems[folioIndex], 
                            RESULTADO_AUDITORIA: data.status,
                            PHOTOS: data.photos.reduce((acc, p) => { acc[p.cat] = p; return acc; }, {}),
                            _faltanNEO: data.faltanNEO || [],
                            _isFirebaseUpdate: true
                        };
                    }
                });
            });

            // 2. Luego actualizamos el estado 'records' de la vista actual
            setRecords(prev => {
                const newRecords = [...prev];
                let changed = false;
                
                snapshot.docChanges().forEach((change) => {
                    const data = change.doc.data();
                    const folioId = String(data.folio);
                    
                    // Encontrar el registro en el estado actual y actualizarlo
                    const index = newRecords.findIndex(r => String(r.FOLIO) === folioId);
                    
                    if (index !== -1) {
                        newRecords[index] = { 
                            ...newRecords[index], 
                            RESULTADO_AUDITORIA: data.status,
                            PHOTOS: data.photos.reduce((acc, p) => { acc[p.cat] = p; return acc; }, {}),
                            _faltanNEO: data.faltanNEO || [],
                            _isFirebaseUpdate: true
                        };
                        changed = true;
                    }
                });
                
                return changed ? newRecords : prev;
            });
        });

        return () => unsubscribe();
    }, []);

    // Table Data (Drill-down)
    const tableData = useMemo(() => {
        let docs = filteredRecords;
        
        if (searchQuery.trim() !== '') {
            // When searching, bypass ALL status filters (including OK) so the user
            // always finds what they're looking for regardless of toggle state.
            const q = searchQuery.trim().toLowerCase();
            docs = docs.filter(r => r.FOLIO && String(r.FOLIO).toLowerCase().includes(q));
        } else {
            // When not searching, apply the OK visibility toggle.
            if (!showOkFolios) {
                docs = docs.filter(r => r.RESULTADO_AUDITORIA !== 'OK');
            }

            // Apply Error Type Filter based on CONDENSED group (only for non-OK records)
            if (selectedErrorTypes.length > 0) {
                docs = docs.filter(r => selectedErrorTypes.includes(MAP_TO_CONDENSED[r.RESULTADO_AUDITORIA]));
            }
        }
        return docs;
    }, [filteredRecords, selectedErrorTypes, searchQuery, showOkFolios]);

    // PDF Export Function
    const exportToPDF = () => {
        const isGeneralSummary = selectedCompany === 'ALL' && selectedContract === 'ALL';

        if (tableData.length === 0 && !isGeneralSummary) {
            setShowAlert(true);
            setTimeout(() => setShowAlert(false), 3000);
            return;
        }

        try {
            const fileNameContext = selectedDelegation !== 'ALL'
                ? selectedDelegation
                : (selectedCompany !== 'ALL' ? selectedCompany : 'Global');
            const pdfFileName = `Resumen_Auditoria_${fileNameContext.toUpperCase().replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;

            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            if (isGeneralSummary) {
                // Generar PDF del Resumen General
                doc.setFontSize(20);
                doc.setTextColor(122, 21, 49);
                doc.text("Resumen Ejecutivo de Auditoría Global", 14, 25);

                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text("GOBIERNO MUNICIPAL DE TOLUCA - CONTROL DE BACHEO", 14, 32);
                doc.line(14, 35, 196, 35);

                const totalOmisiones = kpiData.total;

                doc.setFontSize(11);
                doc.setTextColor(60);
                doc.text(`Total de faltantes y omisiones: ${totalOmisiones}`, 14, 45);

                const summaryColumn = ["Categoría de Error", "Cantidad", "% del Total"];
                const summaryRows = [
                    ["Sin Carpeta / Vacía", kpiData.sinCarpeta, totalOmisiones > 0 ? ((kpiData.sinCarpeta / totalOmisiones) * 100).toFixed(1) + "%" : "0%"],
                    ["Falta: Inicial", kpiData.faltaInicial, totalOmisiones > 0 ? ((kpiData.faltaInicial / totalOmisiones) * 100).toFixed(1) + "%" : "0%"],
                    ["Falta: Caja", kpiData.faltaCaja, totalOmisiones > 0 ? ((kpiData.faltaCaja / totalOmisiones) * 100).toFixed(1) + "%" : "0%"],
                    ["Falta: Terminado", kpiData.faltaTerminado, totalOmisiones > 0 ? ((kpiData.faltaTerminado / totalOmisiones) * 100).toFixed(1) + "%" : "0%"],
                    ["Falta: Folio", kpiData.faltaFolio, totalOmisiones > 0 ? ((kpiData.faltaFolio / totalOmisiones) * 100).toFixed(1) + "%" : "0%"],
                    ["Falta: Corte", kpiData.faltaCorte, totalOmisiones > 0 ? ((kpiData.faltaCorte / totalOmisiones) * 100).toFixed(1) + "%" : "0%"],
                    ["Falta: Demolición", kpiData.faltaDemolicion, totalOmisiones > 0 ? ((kpiData.faltaDemolicion / totalOmisiones) * 100).toFixed(1) + "%" : "0%"],
                    ["Falta: Liga", kpiData.faltaLiga, totalOmisiones > 0 ? ((kpiData.faltaLiga / totalOmisiones) * 100).toFixed(1) + "%" : "0%"],
                    ["Falta: Mezcla", kpiData.faltaMezcla, totalOmisiones > 0 ? ((kpiData.faltaMezcla / totalOmisiones) * 100).toFixed(1) + "%" : "0%"],
                    ["Falta: Limpieza", kpiData.faltaLimpieza, totalOmisiones > 0 ? ((kpiData.faltaLimpieza / totalOmisiones) * 100).toFixed(1) + "%" : "0%"]
                ].filter(row => row[1] > 0); // Solo mostrar categorías con errores

                autoTable(doc, {
                    head: [summaryColumn],
                    body: summaryRows,
                    startY: 55,
                    theme: 'striped',
                    headStyles: { fillColor: [122, 21, 49] },
                    styles: { fontSize: 10 }
                });

                doc.setFontSize(14);
                doc.setTextColor(122, 21, 49);
                doc.text("Desglose por Empresa Raíz", 14, doc.lastAutoTable.finalY + 15);

                const companyColumn = ["Empresa", "Ini", "Caja", "Term", "Folio", "Corte", "Demo", "Liga", "Mezc", "Limp", "S/C", "Total"];

                // Group by _company
                const companyMap = {};
                filteredRecords.forEach(row => {
                    const comp = row._company || "Desconocida";
                    if (!companyMap[comp]) {
                        companyMap[comp] = {
                            name: comp,
                            inicial: 0, caja: 0, terminado: 0,
                            folio: 0, corte: 0, demolicion: 0, liga: 0, mezcla: 0, limpieza: 0,
                            sinCarpeta: 0, total: 0
                        };
                    }

                    const rawType = row.RESULTADO_AUDITORIA || '';
                    if (rawType && rawType !== 'OK') {
                        let rowInc = 0;
                        if (rawType.includes('SIN CARPETA') || rawType.includes('CARPETA VACÍA')) {
                            companyMap[comp].sinCarpeta++;
                            rowInc = 1;
                        } else {
                            if (rawType.includes('INICIAL')) { companyMap[comp].inicial++; rowInc++; }
                            if (rawType.includes('CAJA')) { companyMap[comp].caja++; rowInc++; }
                            if (rawType.includes('TERMINADO')) { companyMap[comp].terminado++; rowInc++; }
                            if (rawType.includes('FOLIO')) { companyMap[comp].folio++; rowInc++; }
                            if (rawType.includes('CORTE')) { companyMap[comp].corte++; rowInc++; }
                            if (rawType.includes('DEMOLICION')) { companyMap[comp].demolicion++; rowInc++; }
                            if (rawType.includes('LIGA')) { companyMap[comp].liga++; rowInc++; }
                            if (rawType.includes('MEZCLA')) { companyMap[comp].mezcla++; rowInc++; }
                            if (rawType.includes('LIMPIEZA')) { companyMap[comp].limpieza++; rowInc++; }
                        }

                        companyMap[comp].total += rowInc;
                    }
                });

                const companyRows = Object.values(companyMap)
                    .sort((a, b) => b.total - a.total)
                    .map(c => [
                        c.name,
                        c.inicial, c.caja, c.terminado,
                        c.folio, c.corte, c.demolicion, c.liga, c.mezcla, c.limpieza,
                        c.sinCarpeta,
                        c.total
                    ]);

                autoTable(doc, {
                    head: [companyColumn],
                    body: companyRows,
                    startY: doc.lastAutoTable.finalY + 20,
                    theme: 'grid',
                    headStyles: { fillColor: [122, 21, 49], halign: 'center', fontSize: 7 },
                    columnStyles: {
                        0: { fontStyle: 'bold', halign: 'left' },
                        11: { halign: 'center', fontStyle: 'bold', textColor: [122, 21, 49] }
                    },
                    styles: { fontSize: 7, cellPadding: 1.5 }
                });

                doc.setFontSize(9);
                doc.setTextColor(150);
                doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, doc.lastAutoTable.finalY + 10);

                const blob = doc.output('blob');
                const url = window.URL.createObjectURL(blob);

                // Abrir previsualización
                window.open(url, '_blank');

                // Disparar descarga con nombre forzado
                const link = document.createElement('a');
                link.href = url;
                link.download = pdfFileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                return;
            }

            // Generar PDF Detallado de Contrato
            // Header Section
            doc.setFontSize(20);
            doc.setTextColor(122, 21, 49); // Brand Deep Wine
            doc.text("REPORTAJE DE EVIDENCIA FOTOGRÁFICA", 14, 25);

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text("GOBIERNO MUNICIPAL DE TOLUCA - CONTROL DE BACHEO", 14, 32);
            doc.line(14, 35, 196, 35);

            // Filter context
            const errorLabel = selectedErrorTypes.length === 0 ? "Todos los tipos" : selectedErrorTypes.join(", ");

            doc.setFontSize(11);
            doc.setTextColor(40);
            doc.text(`Etapa: ${selectedStage === 'ALL' ? 'Global (E1 + E2)' : `Etapa ${selectedStage.slice(1)}`}`, 14, 45);
            doc.text(`Empresa: ${selectedCompany === 'ALL' ? 'Todas' : selectedCompany}`, 14, 51);
            doc.text(`Contrato: ${selectedContract === 'ALL' ? 'General' : selectedContract}`, 14, 57);
            doc.text(`Delegación: ${selectedDelegation === 'ALL' ? 'Todas' : selectedDelegation}`, 14, 63);

            // Multi-line for error types if too long
            const splitErrors = doc.splitTextToSize(`Errores: ${errorLabel}`, 180);
            doc.text(splitErrors, 14, 69);

            const currentY = 69 + (splitErrors.length * 6);
            doc.text(`Total de folios: ${tableData.length}`, 14, currentY);

            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text(`Fecha de reporte: ${new Date().toLocaleString()}`, 14, currentY + 8);

            // Table setup
            const tableColumn = ["Folio", "Estado de Error", "Ubicación (Calle)", "Delegación", "Colonia"];
            const tableRows = tableData.map(row => [
                row.FOLIO || "N/A",
                getDisplayStatus(row),
                row.CALLE || "No especificada",
                row.DELEGACION || "N/A",
                row.COLONIA || "N/A"
            ]);

            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: currentY + 15,
                theme: 'grid',
                headStyles: {
                    fillColor: [122, 21, 49],
                    textColor: [255, 255, 255],
                    fontSize: 9,
                    halign: 'center'
                },
                styles: {
                    fontSize: 7,
                    cellPadding: 3,
                    overflow: 'linebreak'
                }
            });

            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, doc.lastAutoTable.finalY + 10);

            const blob = doc.output('blob');
            const url = window.URL.createObjectURL(blob);

            // Abrir previsualización
            window.open(url, '_blank');

            // Disparar descarga con nombre forzado
            const link = document.createElement('a');
            link.href = url;
            link.download = pdfFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('PDF Export Error:', error);
            alert('Error al generar el documento pdf.');
        }
    };

    const exportErrorsZip = async () => {
        if (records.length === 0) return;
        setIsZipping(true);

        try {
            // 1. Fetch and parse contracts.csv
            const csvRes = await fetch('/contracts.csv');
            const csvText = await csvRes.text();
            const lines = csvText.split('\n');
            const contractMap = {}; // contractNum -> { supervisor, empresa }

            // Skip header
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const columns = lines[i].split(',');
                if (columns.length >= 4) {
                    const rawNum = columns[0].trim().replace('Contrato ', '');
                    const cNum = parseInt(rawNum, 10).toString(); // Normalize "01" to "1"
                    contractMap[cNum] = {
                        contratoOriginal: columns[0].trim(),
                        empresa: columns[2].trim(),
                        supervisor: columns[3].trim() || 'SIN SUPERVISOR ASIGNADO'
                    };
                }
            }

            // 2. Identify contracts with errors
            // We group filteredRecords by contract, but only those with status !== 'OK'
            const errorsByContract = {};
            records.forEach(row => {
                const isOkParcial = row.RESULTADO_AUDITORIA === 'OK' && row._faltanNEO && row._faltanNEO.length > 0;
                if (row.RESULTADO_AUDITORIA && (row.RESULTADO_AUDITORIA !== 'OK' || isOkParcial)) {
                    const rawId = String(row.ID || row._contract || '');
                    const cId = parseInt(rawId, 10).toString(); // Normalize "1" to "1"
                    if (!errorsByContract[cId]) errorsByContract[cId] = [];
                    errorsByContract[cId].push(row);
                }
            });

            const contractsWithErrors = Object.keys(errorsByContract);
            if (contractsWithErrors.length === 0) {
                alert("No se encontraron contratos con errores para exportar.");
                setIsZipping(false);
                return;
            }

            // 3. Create ZIP
            const zip = new JSZip();

            for (const cId of contractsWithErrors) {
                const contractData = contractMap[cId] || { 
                    empresa: 'DESCONOCIDA', 
                    supervisor: 'SIN SUPERVISOR ASIGNADO',
                    contratoOriginal: `Contrato ${cId}`
                };
                
                const supervisorFolder = zip.folder(contractData.supervisor);
                const pdfName = `${contractData.empresa} ${cId}.pdf`;
                
                // Generate PDF Blob for this contract
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                
                // PDF Header
                doc.setFontSize(18);
                doc.setTextColor(122, 21, 49);
                doc.text("REPORTE DE INCIDENCIAS POR CONTRATO", 14, 20);
                
                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text("GOBIERNO MUNICIPAL DE TOLUCA - DIRECCIÓN DE OBRAS PÚBLICAS", 14, 26);
                doc.line(14, 28, 196, 28);

                doc.setFontSize(11);
                doc.setTextColor(40);
                doc.text(`Supervisor: ${contractData.supervisor}`, 14, 38);
                doc.text(`Empresa: ${contractData.empresa}`, 14, 44);
                doc.text(`Contrato: ${contractData.contratoOriginal}`, 14, 50);
                doc.text(`Total Folios con Error: ${errorsByContract[cId].length}`, 14, 56);
                doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 62);

                const tableColumn = ["Folio", "Tipo", "Tipo de Error", "Calle", "Delegación", "Colonia"];
                const tableRows = errorsByContract[cId].map(row => [
                    row.FOLIO || "N/A",
                    row._isNewSet ? "9 Fotos" : "Legacy",
                    getDisplayStatus(row),
                    row.CALLE || "N/A",
                    row.DELEGACION || "N/A",
                    row.COLONIA || "N/A"
                ]);

                autoTable(doc, {
                    head: [tableColumn],
                    body: tableRows,
                    startY: 70,
                    theme: 'grid',
                    headStyles: { fillColor: [122, 21, 49], textColor: [255, 255, 255], fontSize: 9, halign: 'center' },
                    styles: { fontSize: 7, cellPadding: 2 }
                });

                const pdfBlob = doc.output('blob');
                supervisorFolder.file(pdfName, pdfBlob);
            }

            // 4. Generate and download ZIP
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `Errores_Supervisores_${new Date().getTime()}.zip`);

        } catch (error) {
            console.error("Error generating ZIP:", error);
            alert("Hubo un error al generar el archivo ZIP.");
        } finally {
            setIsZipping(false);
        }
    };

    // ── Stage Sync Engine ──────────────────────────────────────────────
    const PHOTO_PATTERNS = {
        'INICIAL': '_inicial', 'FOLIO': '_folio', 'CORTE': '_corte',
        'DEMOLICION': '_demolicion', 'CAJA': '_caja', 'LIGA': '_liga',
        'MEZCLA': '_mezcla', 'TERMINADO': '_terminado', 'LIMPIEZA': '_limpieza'
    };
    const SUPERVISOR_ROOT_ID = '1B54IJmRS_D2J_FECE75RRo3UejfzUPU6';
    const CACHE_KEY_SUP_INDEX = 'supervisor_drive_index';
    const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

    const getCachedSupervisorIndex = () => {
        try {
            const cached = localStorage.getItem(CACHE_KEY_SUP_INDEX);
            if (!cached) return null;
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > CACHE_EXPIRY_MS) {
                localStorage.removeItem(CACHE_KEY_SUP_INDEX);
                return null;
            }
            return data;
        } catch { return null; }
    };

    const saveSupervisorIndex = (data) => {
        try {
            localStorage.setItem(CACHE_KEY_SUP_INDEX, JSON.stringify({ data, timestamp: Date.now() }));
        } catch (e) { console.warn('LocalStorage Full? Could not save index:', e); }
    };

    const runStageSync = async (stageId, mode = 'ADMIN') => {
        const token = localStorage.getItem('drive_access_token');
        if (!token) { alert('Debes iniciar sesión con Google primero.'); return; }

        const stageRecords = records.filter(r => r._stage === stageId);
        if (stageRecords.length === 0) { alert(`No hay registros para Etapa ${stageId.slice(1)}.`); return; }

        setIsSyncing(true);
        const total = stageRecords.length;
        let processed = 0; let updated = 0;
        setSyncProgress({ current: 0, total, stage: stageId });

        let supervisorIndex = null;
        if (mode === 'SUPERVISOR') {
            supervisorIndex = getCachedSupervisorIndex();
            if (!supervisorIndex) {
                setSyncLog('Indexando Drive de Supervisores (Caché vencido o vacío)...');
                supervisorIndex = await buildSupervisorIndex(token);
                if (!supervisorIndex) { setIsSyncing(false); return; }
                saveSupervisorIndex(supervisorIndex);
            }
            setSyncLog(`Índice listo (${Object.keys(supervisorIndex).length} folios). Sincronizando...`);
        } else {
            setSyncLog(`Sincronizando ${total} folios con Drive Admin...`);
        }

        const batchSize = 10; // Subimos un poco el batch
        for (let i = 0; i < stageRecords.length; i += batchSize) {
            const batch = stageRecords.slice(i, i + batchSize);
            await Promise.all(batch.map(async (record) => {
                let folderId = record._folderId;
                if (mode === 'SUPERVISOR') {
                    const folioKey = String(record.FOLIO).trim();
                    folderId = supervisorIndex?.[folioKey] || null;
                }

                if (!folderId) { processed++; return; }

                try {
                    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
                    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,thumbnailLink,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100`;
                    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token }});
                    if (!res.ok) { processed++; return; }

                    const data = await res.json();
                    const files = data.files || [];
                    const newSuffixes = ['_folio', '_corte', '_demolicion', '_liga', '_mezcla', '_limpieza'];
                    const isNew = files.some(f => newSuffixes.some(s => f.name.toLowerCase().includes(s)));
                    const criticalCats = ['INICIAL', 'CAJA', 'TERMINADO'];
                    const neoCats = isNew ? ['FOLIO', 'CORTE', 'DEMOLICION', 'LIGA', 'MEZCLA', 'LIMPIEZA'] : [];
                    const allCats = [...criticalCats, ...neoCats];

                    const found = {}; const recognized = new Set();
                    for (const f of files) {
                        const ln = f.name.toLowerCase();
                        for (const cat of allCats) {
                            if (ln.includes(PHOTO_PATTERNS[cat])) { 
                                recognized.add(f.id); 
                                if (!found[cat]) found[cat] = { id: f.id, thumbnail: f.thumbnailLink, view: f.webViewLink }; 
                            }
                        }
                    }
                    const missingCritical = criticalCats.filter(c => !found[c]);
                    const missingNeo = neoCats.filter(c => !found[c]);

                    let status = 'OK';
                    let faltanNEO = [];

                    if (files.length === 0) {
                        status = 'CARPETA VACÍA';
                    } else if (missingCritical.length > 0) {
                        status = 'FALTA: ' + missingCritical.join(' + ');
                    } else {
                        status = 'OK';
                        faltanNEO = missingNeo;
                    }

                    handleFolioSync(record.FOLIO, found, status, files.filter(f => !recognized.has(f.id)).length, faltanNEO);
                    updated++;
                } catch (e) { console.error(`Sync error ${record.FOLIO}:`, e); }
                processed++;
                setSyncProgress({ current: processed, total, stage: stageId });
            }));
            await new Promise(r => setTimeout(r, 100)); // Throttling
        }
        setSyncLog(`✅ ¡Hecho! ${updated} folios sincronizados.`);
        setIsSyncing(false);
        setTimeout(() => setSyncLog(''), 5000);
    };

    const buildSupervisorIndex = async (token) => {
        try {
            const contractsQ = encodeURIComponent(`'${SUPERVISOR_ROOT_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
            const cRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${contractsQ}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=500`, { headers: { 'Authorization': 'Bearer ' + token }});
            if (!cRes.ok) return null;
            const contracts = (await cRes.json()).files || [];

            const index = {};
            const limit = 5; // Mayor concurrencia
            for (let ci = 0; ci < contracts.length; ci += limit) {
                const batch = contracts.slice(ci, ci + limit);
                await Promise.all(batch.map(async (contract) => {
                    const weeksQ = encodeURIComponent(`'${contract.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
                    const wRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${weeksQ}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100`, { headers: { 'Authorization': 'Bearer ' + token }});
                    if (!wRes.ok) return;
                    const weeks = (await wRes.json()).files || [];

                    // Sincronizar semanas del contrato concurrentemente
                    await Promise.all(weeks.map(async (week) => {
                        const foliosQ = encodeURIComponent(`'${week.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
                        const fRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${foliosQ}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=1000`, { headers: { 'Authorization': 'Bearer ' + token }});
                        if (!fRes.ok) return;
                        const folios = (await fRes.json()).files || [];
                        for (const folio of folios) {
                            index[folio.name.trim()] = folio.id;
                        }
                    }));
                }));
                setSyncLog(`Indexando... ${Math.min(ci + limit, contracts.length)}/${contracts.length} contratos`);
                await new Promise(r => setTimeout(r, 50));
            }
            return index;
        } catch (e) { console.error('Index error:', e); return null; }
    };

    const handleFolioSync = (folioStr, newPhotos, newStatus, extraPhotosCount = 0, faltanNEO = []) => {
        setRecords(prevRecords => prevRecords.map(r => {
            if (String(r.FOLIO) === String(folioStr)) {
                // Save to localStorage
                try {
                    const optimisticStoreStr = localStorage.getItem('optimistic_folios') || '{}';
                    const optimisticStore = JSON.parse(optimisticStoreStr);
                    optimisticStore[folioStr] = { 
                        PHOTOS: newPhotos, 
                        RESULTADO_AUDITORIA: newStatus, 
                        EXTRA_PHOTOS: extraPhotosCount,
                        _faltanNEO: faltanNEO
                    };
                    localStorage.setItem('optimistic_folios', JSON.stringify(optimisticStore));
                } catch(e) {}

                return { ...r, PHOTOS: newPhotos, RESULTADO_AUDITORIA: newStatus, EXTRA_PHOTOS: extraPhotosCount, _faltanNEO: faltanNEO };
            }
            return r;
        }));

        setSelectedVisualizerFolio(prev => {
            if (prev && String(prev.FOLIO) === String(folioStr)) {
                return { ...prev, PHOTOS: newPhotos, RESULTADO_AUDITORIA: newStatus, _faltanNEO: faltanNEO };
            }
            return prev;
        });
    };

    return (
        <React.Fragment>
            {/* Alert Notification */}
            <AnimatePresence>
                {showAlert && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 20 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-primary text-white px-6 py-3 rounded shadow-xl flex items-center gap-3 border border-red-400"
                    >
                        <span className="material-symbols-outlined">error</span>
                        <span className="font-semibold text-sm">¡No hay registros para exportar!</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header Section */}
            <header className={`${driveMode === 'SUPERVISOR' ? 'header-gradient header-gradient-supervisor' : 'header-gradient'} text-white shadow-lg`} style={{ transition: 'all 0.6s ease' }}>
                <div className="semi-circle-1"></div>
                <div className="semi-circle-2"></div>
                <div className="w-full max-w-[1536px] mx-auto px-4 lg:px-8 py-4 relative z-10">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3">
                                <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm">
                                    <span className="material-symbols-outlined text-3xl">account_balance</span>
                                </div>
                                <div>
                                    <h1 className="text-xl font-black tracking-tight leading-none uppercase">Toluca Capital</h1>
                                    <p className="text-[10px] font-medium tracking-[0.2em] opacity-80 uppercase">Ayuntamiento 2025-2027</p>
                                </div>
                            </div>
                            <div className="h-10 w-[1px] bg-white/20 hidden md:block"></div>
                            <div className="hidden md:block">
                                <h2 className="text-lg font-bold leading-tight">Supervisión Inteligente</h2>
                                <p className="text-sm font-light opacity-90">DIRECCIÓN DE OBRAS PÚBLICAS</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 w-full md:w-auto flex-wrap">
                            {/* Drive Mode Selector */}
                            <div className="drive-mode-selector">
                                <button
                                    onClick={() => setDriveMode('ADMIN')}
                                    className={`drive-mode-btn ${driveMode === 'ADMIN' ? 'active admin-active' : ''}`}
                                    title="Ver datos del Drive Administrador (corregido)"
                                >
                                    <span className="material-symbols-outlined text-sm">verified</span>
                                    Admin
                                </button>
                                <button
                                    onClick={() => setDriveMode('SUPERVISOR')}
                                    className={`drive-mode-btn ${driveMode === 'SUPERVISOR' ? 'active supervisor-active' : ''}`}
                                    title="Ver datos del Drive RAW de Supervisores"
                                >
                                    <span className="material-symbols-outlined text-sm">group</span>
                                    Supervisores
                                </button>
                            </div>

                            <button
                                onClick={() => exportErrorsZip()}
                                disabled={isZipping || isLoading}
                                className={`flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/30 rounded-lg text-sm font-bold transition-all backdrop-blur-md shadow-lg disabled:opacity-50 ${isZipping ? 'animate-pulse' : ''}`}
                                title="Exportar Reportes de Errores por Supervisor"
                            >
                                <span className={`material-symbols-outlined text-sm ${isZipping ? 'animate-spin' : ''}`}>
                                    {isZipping ? 'sync' : 'folder_zip'}
                                </span> 
                                <span className="hidden sm:inline">{isZipping ? 'Generando...' : 'Exportar ZIP'}</span>
                            </button>

                            <button
                                onClick={exportToPDF}
                                className="flex items-center justify-center p-2 bg-white/10 hover:bg-white/20 text-white border border-white/30 rounded-lg transition-all backdrop-blur-md shadow-lg"
                                title={selectedCompany === 'ALL' ? 'Descargar Resumen General PDF' : 'Exportar Detalles PDF'}
                            >
                                <span className="material-symbols-outlined text-[20px]">download</span>
                            </button>

                            <button
                                onClick={() => setIsDarkMode(!isDarkMode)}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                                title="Cambiar Tema"
                            >
                                <span className="material-symbols-outlined">{isDarkMode ? 'light_mode' : 'dark_mode'}</span>
                            </button>
                            <div
                                className="flex items-center gap-3 pl-2 border-l border-white/20 cursor-pointer hover:opacity-80 transition-opacity"
                                title="Perfil de Usuario"
                            >
                                <div className="text-right hidden sm:block">
                                    <p className="text-xs font-bold leading-none">{loggedInProfile?.name || 'Usuario'}</p>
                                    <p className="text-[10px] opacity-70">{isAdmin ? 'Administrador' : 'Supervisor'}</p>
                                </div>
                                <div className="w-10 h-10 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center overflow-hidden">
                                    {loggedInProfile?.picture ? <img src={loggedInProfile.picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span className="material-symbols-outlined text-xl">person</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="w-full max-w-[1536px] mx-auto px-4 lg:px-8 py-8">
                {/* Title and Filters */}
                <div className="mt-6 mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Panel de Control de Evidencias</h3>
                        <p className="text-slate-500 dark:text-slate-400">Estado actual de folios y seguimiento de incidencias administrativas</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1">Etapa de Obra</label>
                            <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg border border-slate-200 dark:border-slate-600">
                                {['E1', 'E2', 'E3', 'ALL'].map(stage => (
                                    <button
                                        key={stage}
                                        onClick={() => handleStageChange(stage)}
                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${selectedStage === stage
                                            ? 'bg-white dark:bg-slate-500 text-primary dark:text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                            }`}
                                    >
                                        {stage === 'ALL' ? 'GLOBAL' : `ETAPA ${stage.slice(1)}`}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1">Empresa Raíz</label>
                            <div className="relative">
                                <select
                                    value={selectedCompany}
                                    onChange={(e) => handleCompanyChange(e.target.value)}
                                    className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded px-3 py-2 pr-8 focus:ring-primary focus:border-primary dark:text-white"
                                >
                                    {companies.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">expand_more</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1">Contrato</label>
                            <div className="relative">
                                <select
                                    value={selectedContract}
                                    onChange={(e) => setSelectedContract(e.target.value)}
                                    disabled={selectedCompany === 'ALL'}
                                    className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded px-3 py-2 pr-8 focus:ring-primary focus:border-primary disabled:opacity-50 dark:text-white"
                                >
                                    {contracts.map(id => <option key={id} value={id}>{id === 'ALL' ? 'TODOS' : id}</option>)}
                                </select>
                                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">expand_more</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1">Delegación</label>
                            <div className="relative">
                                <select
                                    value={selectedDelegation}
                                    onChange={(e) => setSelectedDelegation(e.target.value)}
                                    className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold rounded px-3 py-2 pr-8 focus:ring-primary focus:border-primary disabled:opacity-50 dark:text-white"
                                >
                                    {delegations.map(d => <option key={d} value={d}>{d === 'ALL' ? 'TODAS' : d}</option>)}
                                </select>
                                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">expand_more</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sync Action Bar */}
                <div className="sync-action-bar mb-6">
                    <div className="flex items-center gap-2 mr-4">
                        <span className="material-symbols-outlined text-lg text-primary dark:text-white">sync</span>
                        <span className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Sincronización</span>
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${driveMode === 'ADMIN' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {driveMode === 'ADMIN' ? '📁 Drive Admin' : '📂 Drive Supervisores'}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {['E1', 'E2', 'E3'].map(stageId => (
                            <button
                                key={stageId}
                                onClick={() => runStageSync(stageId, driveMode)}
                                disabled={isSyncing || isLoading}
                                className="sync-btn"
                                title={`Sincronizar folios de Etapa ${stageId.slice(1)} con ${driveMode === 'ADMIN' ? 'Drive Admin' : 'Drive Supervisores'}`}
                            >
                                <span className={`material-symbols-outlined text-sm ${isSyncing && syncProgress.stage === stageId ? 'animate-spin' : ''}`}>
                                    {isSyncing && syncProgress.stage === stageId ? 'sync' : 'cloud_sync'}
                                </span>
                                Etapa {stageId.slice(1)}
                                {driveMode === 'SUPERVISOR' && stageId === 'E3' && <span className="text-[8px] opacity-70 ml-1">(RAW)</span>}
                            </button>
                        ))}
                    </div>
                    {isSyncing && (
                        <div className="sync-progress-container">
                            <div className="sync-progress-bar" style={{ width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total * 100) : 0}%` }} />
                            <span className="sync-progress-text">
                                {syncProgress.current}/{syncProgress.total} — {syncLog}
                            </span>
                        </div>
                    )}
                    {!isSyncing && syncLog && (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-auto animate-pulse">{syncLog}</span>
                    )}
                </div>

                {/* KPI Cards Grid */}
                <motion.div 
                    className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.5fr_repeat(5,1fr)] gap-4 mb-8"
                    key={`kpi-${driveMode}`}
                    initial={{ opacity: 0.7, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                >
                    <div className={`col-span-2 md:col-span-2 lg:col-span-1 kpi-card bg-emerald-50 dark:bg-emerald-900/20 p-5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 shadow-sm border-l-4 border-l-emerald-500 flex justify-between items-center ${driveMode === 'SUPERVISOR' ? 'supervisor-aura' : ''}`}>
                        <div>
                            <p className="text-[10px] xl:text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">OK Parcial</p>
                            <h4 className="text-2xl xl:text-3xl font-black text-emerald-700 dark:text-emerald-300">
                                <AnimatedCounter value={kpiData.ok} />
                            </h4>
                        </div>
                        <div className="h-10 w-[3px] rounded-full bg-emerald-300 dark:bg-emerald-600 mx-3 hidden sm:block"></div>
                        <div className="text-right">
                            <p className="text-[10px] xl:text-xs font-semibold text-emerald-600/80 dark:text-emerald-400/80 uppercase tracking-wider mb-1">OK Totales (100%)</p>
                            <h4 className="text-2xl xl:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                                <AnimatedCounter value={kpiData.okTotal} />
                            </h4>
                        </div>
                    </div>
                    <div className={`kpi-card bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-indigo-500 ${driveMode === 'SUPERVISOR' ? 'supervisor-aura' : ''}`}>
                        <p className="text-[10px] xl:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Errores Físicos</p>
                        <h4 className="text-2xl xl:text-3xl font-black text-slate-800 dark:text-slate-100"><AnimatedCounter value={kpiData.total} /></h4>
                    </div>
                    <div className={`kpi-card bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-primary ${driveMode === 'SUPERVISOR' ? 'supervisor-aura' : ''}`}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Sin Carpeta / Vacía</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100"><AnimatedCounter value={kpiData.sinCarpeta} /></h4>
                    </div>
                    <div className={`kpi-card bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-500 ${driveMode === 'SUPERVISOR' ? 'supervisor-aura' : ''}`}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Falta: Inicial</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100"><AnimatedCounter value={kpiData.faltaInicial} /></h4>
                    </div>
                    <div className={`kpi-card bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-500 ${driveMode === 'SUPERVISOR' ? 'supervisor-aura' : ''}`}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Falta: Caja</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100"><AnimatedCounter value={kpiData.faltaCaja} /></h4>
                    </div>
                    <div className={`kpi-card bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-red-500 ${driveMode === 'SUPERVISOR' ? 'supervisor-aura' : ''}`}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Falta: Terminado</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100"><AnimatedCounter value={kpiData.faltaTerminado} /></h4>
                    </div>
                </motion.div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Visualizations Section */}
                    <div className="xl:col-span-1 flex flex-col gap-6">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                                {selectedContract !== 'ALL' ? `Contrato: ${selectedContract}` : selectedCompany !== 'ALL' ? `Contratos: ${selectedCompany}` : 'Conteo Faltantes'}
                            </p>
                            <div className="h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={barData} layout="horizontal" margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            stroke={isDarkMode ? "#737373" : "#a3a3a3"}
                                            fontSize={10}
                                            tickLine={false}
                                            axisLine={false}
                                            angle={barData.length > 5 ? -45 : 0}
                                            textAnchor={barData.length > 5 ? "end" : "middle"}
                                        />
                                        <YAxis stroke={isDarkMode ? "#737373" : "#a3a3a3"} fontSize={10} tickLine={false} axisLine={false} width={30} />
                                        <Tooltip
                                            cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }}
                                            contentStyle={{
                                                backgroundColor: isDarkMode ? '#262626' : '#fff',
                                                border: isDarkMode ? '1px solid #404040' : '1px solid #e5e5e5',
                                                borderRadius: '8px',
                                                color: isDarkMode ? '#fff' : '#171717'
                                            }}
                                        />
                                        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={barData.length < 5 ? 60 : 30}>
                                            {barData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                                {(selectedCompany === 'ALL' && selectedContract === 'ALL') ? 'Eficiencia Global (% OK)' : 'Eficiencia por Contrato (% OK)'}
                            </p>
                            <div className="h-[220px] w-full mb-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={
                                                (selectedCompany === 'ALL' && selectedContract === 'ALL') 
                                                    ? [
                                                        { name: 'Folios OK', ok: kpiData.ok, fill: '#22c55e', pct: Math.round((kpiData.ok / (filteredRecords.length || 1)) * 100) },
                                                        { name: 'Faltantes', ok: filteredRecords.length - kpiData.ok, fill: '#ef4444', pct: Math.round(((filteredRecords.length - kpiData.ok) / (filteredRecords.length || 1)) * 100) }
                                                      ]
                                                    : contractStats
                                            }
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={4}
                                            dataKey="ok"
                                            nameKey="name"
                                            animationBegin={200}
                                        >
                                            {((selectedCompany === 'ALL' && selectedContract === 'ALL') 
                                                ? [
                                                    { name: 'Folios OK', fill: '#22c55e' },
                                                    { name: 'Faltantes', fill: '#ef4444' }
                                                  ]
                                                : contractStats).map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: isDarkMode ? '#262626' : '#fff',
                                                border: isDarkMode ? '1px solid #404040' : '1px solid #e5e5e5',
                                                borderRadius: '8px',
                                                color: isDarkMode ? '#fff' : '#171717'
                                            }}
                                            formatter={(value, name, props) => {
                                                if (selectedCompany === 'ALL' && selectedContract === 'ALL') {
                                                    return [`${value} folios (${props.payload.pct}%)`, props.payload.name];
                                                }
                                                return [`${value} folios OK (${props.payload.pct}% meta)`, `Contrato ${props.payload.name}`];
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            
                            {/* Desglose de Contratos en lista scrolleable */}
                            <div className="flex-1 overflow-y-auto max-h-[120px] pr-2 custom-scrollbar">
                                <div className="flex flex-col gap-2">
                                    {contractStats.length === 0 ? (
                                        <div className="text-xs text-slate-400 text-center py-4">No hay datos de contratos</div>
                                    ) : (
                                        contractStats.map(c => (
                                            <div key={c.name} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded text-xs">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700 dark:text-slate-200">{c.name}</span>
                                                    <span className="text-[9px] text-slate-400">{c.company}</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-right">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-800 dark:text-slate-100">{c.ok} / {c.total}</span>
                                                        <span className="text-[9px] text-slate-400">Folios OK</span>
                                                    </div>
                                                    <div className={`font-black px-2 py-1 rounded text-white min-w-[40px] text-center`} style={{ backgroundColor: c.fill }}>
                                                        {c.pct}%
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Data Table Section */}
                    <div className="xl:col-span-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h5 className="font-bold text-slate-800 dark:text-slate-100">Registros de Incidencias</h5>
                            <div className="flex flex-wrap gap-2 items-center">
                                <div className="relative mr-2">
                                    <input 
                                        type="text" 
                                        placeholder="Buscar Folio..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-xs w-36 sm:w-48 focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                    <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">search</span>
                                </div>
                                <button
                                    onClick={() => toggleErrorType('ALL')}
                                    className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${selectedErrorTypes.length === 0 ? 'bg-primary text-white border-transparent' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                                >
                                    TODOS
                                </button>
                                <button
                                    onClick={() => setShowOkFolios(!showOkFolios)}
                                    className={`px-3 flex items-center gap-1 py-1.5 rounded-full text-[10px] sm:text-xs font-bold uppercase transition-all ${
                                        showOkFolios 
                                            ? 'bg-green-500 text-white shadow-md shadow-green-500/20' 
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                                    }`}
                                >
                                    {showOkFolios ? <span className="material-symbols-outlined text-[14px]">visibility</span> : <span className="material-symbols-outlined text-[14px]">visibility_off</span>}
                                    {showOkFolios ? 'Folios OK Visibles' : 'Folios OK Ocultos'}
                                </button>
                                {CONDENSED_CATEGORIES.map(type => (
                                    <button
                                        key={type}
                                        onClick={() => toggleErrorType(type)}
                                        className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${selectedErrorTypes.includes(type)
                                            ? 'text-white'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
                                            }`}
                                        style={selectedErrorTypes.includes(type) ? {
                                            backgroundColor: getColorForStatus(type),
                                            borderColor: getColorForStatus(type)
                                        } : {}}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="overflow-x-auto overflow-y-auto w-full h-[580px] max-h-[580px] custom-scrollbar">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center p-20 text-slate-500 gap-4 h-full">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                                    <p className="text-sm font-bold uppercase tracking-widest text-primary">
                                        {loadingMessage || 'Cargando folios...'}
                                    </p>
                                    <p className="text-xs text-slate-400 max-w-xs text-center">
                                        Los siguientes cambios de etapa serán instantáneos gracias a la caché.
                                    </p>
                                </div>
                            ) : tableData.length > 0 ? (
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-slate-50 dark:bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                                            <th className="px-6 py-4">Folio</th>
                                            <th className="px-6 py-4">Tipo de Error</th>
                                            <th className="px-6 py-4">Calle</th>
                                            <th className="px-6 py-4">Delegación</th>
                                            <th className="px-6 py-4">Colonia</th>
                                            <th className="px-6 py-4 text-center">Evidencia</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {tableData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                                <td className="px-6 py-4 font-bold text-primary dark:text-white text-sm">{row.FOLIO}</td>
                                                <td className="px-6 py-4">
                                                    <span
                                                        className="px-2 py-1 rounded text-[10px] font-black uppercase text-white shadow-sm"
                                                        style={{ backgroundColor: getColorForStatus(getDisplayStatus(row)) }}
                                                    >
                                                        {getDisplayStatus(row)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{row.CALLE}</td>
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{row.DELEGACION}</td>
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{row.COLONIA}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        {row.EXTRA_PHOTOS > 0 && (
                                                            <span 
                                                                className="flex items-center justify-center w-5 h-5 bg-orange-500 text-white text-[10px] font-black rounded-full shadow-lg shadow-orange-500/40 animate-pulse border border-orange-400" 
                                                                title={`${row.EXTRA_PHOTOS} archivos extra sin clasificar en la carpeta de Drive`}
                                                            >
                                                                {row.EXTRA_PHOTOS}
                                                            </span>
                                                        )}
                                                        <button 
                                                            onClick={() => setSelectedVisualizerFolio(row)}
                                                            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-all text-primary dark:text-white border border-transparent hover:border-slate-300 dark:hover:border-slate-500"
                                                            title="Ver Evidencia y Gestionar Archivos"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">visibility</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="flex flex-col items-center justify-center p-20 text-slate-400 gap-4 h-full">
                                    <span className="material-symbols-outlined text-4xl opacity-50">search_off</span>
                                    <p className="text-sm font-bold uppercase tracking-widest">Sin datos coincidentes</p>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-800 rounded-b-lg">
                            <p className="text-xs text-slate-500 font-medium">Mostrando <span className="font-bold">{tableData.length}</span> registros filtrados</p>
                            <span className={`mode-indicator ${driveMode === 'ADMIN' ? 'admin' : 'supervisor'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{driveMode === 'ADMIN' ? 'verified' : 'group'}</span>
                                {driveMode === 'ADMIN' ? 'Drive Admin' : 'Drive Supervisores'}
                            </span>
                        </div>
                    </div>
                </div>
            </main>

            {/* Floating Supervisor Badge */}
            <AnimatePresence>
                {driveMode === 'SUPERVISOR' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="supervisor-badge"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>warning</span>
                        Modo RAW Supervisores
                    </motion.div>
                )}
            </AnimatePresence>

            <FolioVisualizerModal 
                isOpen={!!selectedVisualizerFolio} 
                onClose={() => setSelectedVisualizerFolio(null)} 
                folioData={selectedVisualizerFolio} 
                onFolioSync={handleFolioSync}
                driveMode={driveMode}
            />
        </React.Fragment>
    );
};

export default PhotoEvidenceDashboard;
