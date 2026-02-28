import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    LayoutDashboard, AlertTriangle, Filter, Table as TableIcon,
    PieChart as PieIcon, BarChart3, ArrowRight, ChevronDown,
    MapPin, AlertCircle, FileText, AlertOctagon
} from 'lucide-react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { GLOBAL_TOTALS, RESUMEN_DATA, FILTERS_MAP, ERROR_TYPES } from '../dataMock';

const getColorForStatus = (status) => {
    if (!status) return '#64748b'; // Default Slate
    const s = status.toUpperCase();
    if (s === 'FALTANTES MULTIPLES') return '#be123c'; // Rose-700 (Muy Crítico)
    if (s.includes('FINAL')) return '#ef4444'; // Red (Crítico)
    if (s.includes('INICIAL') || s.includes('CAJA')) return '#f97316'; // Orange (Advertencia)
    if (s === 'OK') return '#22c55e'; // Green
    if (s === 'SIN CARPETA') return '#eab308'; // Yellow
    if (s === 'CARPETA VACÍA') return '#d97706'; // Amber
    return '#8b5cf6'; // Purple fallback
};

// Option B Grouping Logic
const CONDENSED_CATEGORIES = [];
const MAP_TO_CONDENSED = {};

ERROR_TYPES.forEach(type => {
    if (type === 'OK') {
        MAP_TO_CONDENSED[type] = null;
    } else if (type.includes('+') || type.includes(' Y ')) {
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

const PhotoEvidenceDashboard = () => {
    const [selectedCompany, setSelectedCompany] = useState('ALL');
    const [selectedContract, setSelectedContract] = useState('ALL');
    const [selectedErrorTypes, setSelectedErrorTypes] = useState([]);
    const [showAlert, setShowAlert] = useState(false);

    // Lazy Loading States
    const [records, setRecords] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Theme State
    const [isDarkMode, setIsDarkMode] = useState(false);
    useEffect(() => {
        if (isDarkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [isDarkMode]);

    const companies = useMemo(() => ['ALL', ...Object.keys(FILTERS_MAP)], []);

    const contracts = useMemo(() => {
        if (selectedCompany === 'ALL') return ['ALL'];
        return ['ALL', ...(FILTERS_MAP[selectedCompany] || [])];
    }, [selectedCompany]);

    const kpiData = useMemo(() => {
        // Obtenemos los totales agregados basados en el desglose actual sin importar el filtro de error (solo por dropdown)
        let total = 0, sinCarpeta = 0, faltaInicial = 0, faltaCaja = 0, faltaFinal = 0;
        let filtered = RESUMEN_DATA;
        if (selectedCompany !== 'ALL') filtered = filtered.filter(r => r.EMPRESA_RAIZ_MASTER === selectedCompany);
        if (selectedContract !== 'ALL') filtered = filtered.filter(r => r.ID.toString() === selectedContract);

        filtered.forEach(row => {
            total += (row.TOTAL_OMISIONES || 0);
            ERROR_TYPES.forEach(rawType => {
                const amount = row[rawType] || 0;
                if (amount > 0) {
                    if (rawType.includes('SIN CARPETA') || rawType.includes('CARPETA VACÍA')) sinCarpeta += amount;
                    else if (rawType === 'FALTA: INICIAL') faltaInicial += amount;
                    else if (rawType === 'FALTA: CAJA') faltaCaja += amount;
                    else if (rawType === 'FALTA: FINAL') faltaFinal += amount;
                }
            });
        });
        return { total, sinCarpeta, faltaInicial, faltaCaja, faltaFinal };
    }, [selectedCompany, selectedContract]);

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

    // Filtered data for visualizations
    const filteredResumen = useMemo(() => {
        let data = RESUMEN_DATA;
        if (selectedCompany !== 'ALL') {
            data = data.filter(r => r.EMPRESA_RAIZ_MASTER === selectedCompany);
        }
        if (selectedContract !== 'ALL') {
            data = data.filter(r => r.ID.toString() === selectedContract);
        }
        return data;
    }, [selectedCompany, selectedContract]);

    // Pie Chart Data
    const pieData = useMemo(() => {
        const sums = {};
        CONDENSED_CATEGORIES.forEach(type => sums[type] = 0);

        filteredResumen.forEach(row => {
            ERROR_TYPES.forEach(rawType => {
                const condensed = MAP_TO_CONDENSED[rawType];
                if (condensed) {
                    sums[condensed] += (row[rawType] || 0);
                }
            });
        });

        return CONDENSED_CATEGORIES.map(name => ({
            name,
            value: sums[name],
            color: getColorForStatus(name)
        })).filter(d => d.value > 0);
    }, [filteredResumen]);

    // Bar Chart Data
    const barData = useMemo(() => {
        if (selectedContract !== 'ALL') {
            // Desglose del contrato específico
            const sums = {};
            CONDENSED_CATEGORIES.forEach(type => sums[type] = 0);
            const row = filteredResumen[0];
            if (row) {
                ERROR_TYPES.forEach(rawType => {
                    const condensed = MAP_TO_CONDENSED[rawType];
                    if (condensed) sums[condensed] += (row[rawType] || 0);
                });
            }
            return CONDENSED_CATEGORIES.map(type => ({
                name: type,
                value: sums[type],
                color: getColorForStatus(type)
            }));
        } else if (selectedCompany !== 'ALL') {
            // Comparativa de contratos de la empresa
            return filteredResumen.map(row => {
                let total = 0;
                ERROR_TYPES.forEach(rawType => {
                    const condensed = MAP_TO_CONDENSED[rawType];
                    if (condensed) total += (row[rawType] || 0);
                });
                return {
                    name: `Contrato ${row.ID}`,
                    value: total,
                    color: '#8b5cf6' // Purple for contract comparison
                };
            });
        } else {
            // General por tipos
            const sums = {};
            CONDENSED_CATEGORIES.forEach(type => sums[type] = 0);
            RESUMEN_DATA.forEach(row => {
                ERROR_TYPES.forEach(rawType => {
                    const condensed = MAP_TO_CONDENSED[rawType];
                    if (condensed) sums[condensed] += (row[rawType] || 0);
                });
            });
            return CONDENSED_CATEGORIES.map(type => ({
                name: type,
                value: sums[type],
                color: getColorForStatus(type)
            }));
        }
    }, [selectedCompany, selectedContract, filteredResumen]);

    // Table Data (Drill-down)
    // Lazy Loading Effect
    useEffect(() => {
        const fetchRecords = async () => {
            if (selectedCompany === 'ALL' && selectedContract === 'ALL') {
                setRecords([]);
                return;
            }

            setIsLoading(true);
            let allRecords = [];

            try {
                if (selectedContract !== 'ALL') {
                    const url = `/contratos/${selectedCompany}_${selectedContract}.json`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        allRecords = data;
                    }
                } else if (selectedCompany !== 'ALL') {
                    const ids = FILTERS_MAP[selectedCompany];
                    const promises = ids.map(id => fetch(`/contratos/${selectedCompany}_${id}.json`).then(r => r.ok ? r.json() : []));
                    const results = await Promise.all(promises);
                    allRecords = results.flat();
                }
                setRecords(allRecords);
            } catch (error) {
                console.error("Error fetching records:", error);
                setRecords([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchRecords();
    }, [selectedCompany, selectedContract]);

    // Table Data (Drill-down)
    const tableData = useMemo(() => {
        // Filter out records mapped to null (e.g., 'OK')
        let filtered = records.filter(r => MAP_TO_CONDENSED[r.RESULTADO_AUDITORIA] !== null);

        // Apply Error Type Filter based on CONDENSED group
        if (selectedErrorTypes.length > 0) {
            filtered = filtered.filter(r => selectedErrorTypes.includes(MAP_TO_CONDENSED[r.RESULTADO_AUDITORIA]));
        }

        return filtered;
    }, [records, selectedErrorTypes]);

    // PDF Export Function
    const exportToPDF = () => {
        const isGeneralSummary = selectedCompany === 'ALL' && selectedContract === 'ALL';

        if (tableData.length === 0 && !isGeneralSummary) {
            setShowAlert(true);
            setTimeout(() => setShowAlert(false), 3000);
            return;
        }

        try {
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            if (isGeneralSummary) {
                // Generar PDF del Resumen General
                doc.setFontSize(20);
                doc.setTextColor(139, 92, 246);
                doc.text("Resumen Ejecutivo de Auditoría Global", 14, 25);

                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text("GOBIERNO MUNICIPAL DE TOLUCA - CONTROL DE BACHEO", 14, 32);
                doc.line(14, 35, 196, 35);

                const totalOmisiones = RESUMEN_DATA.reduce((acc, row) => acc + row.TOTAL_OMISIONES, 0);

                doc.setFontSize(11);
                doc.setTextColor(60);
                doc.text(`Total de folios observados: ${totalOmisiones}`, 14, 45);

                const summaryColumn = ["Categoría de Error", "Cantidad", "% del Total"];
                const errorSums = {};
                CONDENSED_CATEGORIES.forEach(type => {
                    errorSums[type] = 0;
                    ERROR_TYPES.forEach(rawType => {
                        if (MAP_TO_CONDENSED[rawType] === type) {
                            errorSums[type] += RESUMEN_DATA.reduce((acc, row) => acc + (row[rawType] || 0), 0);
                        }
                    });
                });

                const summaryRows = CONDENSED_CATEGORIES.map(type => [
                    type,
                    errorSums[type],
                    totalOmisiones > 0 ? ((errorSums[type] / totalOmisiones) * 100).toFixed(1) + "%" : "0%"
                ]);

                autoTable(doc, {
                    head: [summaryColumn],
                    body: summaryRows,
                    startY: 55,
                    theme: 'striped',
                    headStyles: { fillColor: [139, 92, 246] },
                    styles: { fontSize: 10 }
                });

                doc.setFontSize(14);
                doc.text("Desglose por Empresa Raíz", 14, doc.lastAutoTable.finalY + 15);

                const companyColumn = ["Empresa", "Iniciales", "Caja", "Finales", "Sin Carpeta/Vacías", "Total Faltan (Fotos)"];

                // Group by EMPRESA_RAIZ_MASTER
                const companyMap = {};
                RESUMEN_DATA.forEach(row => {
                    const comp = row.EMPRESA_RAIZ_MASTER || "Desconocida";
                    if (!companyMap[comp]) {
                        companyMap[comp] = {
                            name: comp,
                            inicial: 0,
                            caja: 0,
                            final: 0,
                            sinCarpeta: 0,
                            total: 0
                        };
                    }

                    ERROR_TYPES.forEach(rawType => {
                        const amount = row[rawType] || 0;
                        if (amount > 0) {
                            if (rawType.includes('+') || rawType.includes(' Y ')) {
                                // Descomponer y sumar a columnas individuales
                                if (rawType.includes('INICIAL')) companyMap[comp].inicial += amount;
                                if (rawType.includes('CAJA')) companyMap[comp].caja += amount;
                                if (rawType.includes('FINAL')) companyMap[comp].final += amount;
                            } else if (rawType === 'FALTA: INICIAL') {
                                companyMap[comp].inicial += amount;
                            } else if (rawType === 'FALTA: CAJA') {
                                companyMap[comp].caja += amount;
                            } else if (rawType === 'FALTA: FINAL') {
                                companyMap[comp].final += amount;
                            } else if (rawType === 'SIN CARPETA' || rawType === 'CARPETA VACÍA') {
                                companyMap[comp].sinCarpeta += amount;
                            }
                        }
                    });

                    companyMap[comp].total += row.TOTAL_OMISIONES;
                });

                const companyRows = Object.values(companyMap)
                    .sort((a, b) => b.total - a.total)
                    .map(c => [
                        c.name,
                        c.inicial,
                        c.caja,
                        c.final,
                        c.sinCarpeta,
                        c.total
                    ]);

                autoTable(doc, {
                    head: [companyColumn],
                    body: companyRows,
                    startY: doc.lastAutoTable.finalY + 20,
                    theme: 'grid',
                    headStyles: { fillColor: [71, 85, 105], halign: 'center', fontSize: 8 },
                    columnStyles: {
                        0: { fontStyle: 'bold', halign: 'left' },
                        1: { halign: 'center' },
                        2: { halign: 'center' },
                        3: { halign: 'center' },
                        4: { halign: 'center' },
                        5: { halign: 'center', fontStyle: 'bold', textColor: [190, 18, 60] } // Resaltar el total
                    },
                    styles: { fontSize: 8 }
                });

                doc.setFontSize(9);
                doc.setTextColor(150);
                doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, doc.lastAutoTable.finalY + 10);

                window.open(doc.output('bloburl'), '_blank');
                doc.save(`Resumen_Auditoria_Global_${new Date().getTime()}.pdf`);
                return;
            }

            // Generar PDF Detallado de Contrato
            // Header Section
            doc.setFontSize(20);
            doc.setTextColor(139, 92, 246); // Brand Purple
            doc.text("REPORTAJE DE EVIDENCIA FOTOGRÁFICA", 14, 25);

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text("GOBIERNO MUNICIPAL DE TOLUCA - CONTROL DE BACHEO", 14, 32);
            doc.line(14, 35, 196, 35);

            // Filter context
            const errorLabel = selectedErrorTypes.length === 0 ? "Todos los tipos" : selectedErrorTypes.join(", ");

            doc.setFontSize(11);
            doc.setTextColor(40);
            doc.text(`Empresa: ${selectedCompany === 'ALL' ? 'Todas' : selectedCompany}`, 14, 45);
            doc.text(`Contrato: ${selectedContract === 'ALL' ? 'General' : selectedContract}`, 14, 51);

            // Multi-line for error types if too long
            const splitErrors = doc.splitTextToSize(`Errores: ${errorLabel}`, 180);
            doc.text(splitErrors, 14, 57);

            const currentY = 57 + (splitErrors.length * 6);
            doc.text(`Total de folios: ${tableData.length}`, 14, currentY);

            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text(`Fecha de reporte: ${new Date().toLocaleString()}`, 14, currentY + 8);

            // Table setup
            const tableColumn = ["Folio", "Estado de Error", "Ubicación (Calle)", "Delegación", "Colonia"];
            const tableRows = tableData.map(row => [
                row.FOLIO || "N/A",
                row.RESULTADO_AUDITORIA || "N/A",
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
                    fillColor: [139, 92, 246],
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

            // Si es un contrato, no añadimos la hoja general extra, la mantuvimos exclusiva para el reporte general

            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, doc.lastAutoTable.finalY + 10);

            window.open(doc.output('bloburl'), '_blank');
            doc.save(`Detalle_Contrato_${selectedContract}_${new Date().getTime()}.pdf`);
        } catch (error) {
            console.error('PDF Export Error:', error);
            alert('Error al generar el documento pdf.');
        }
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
            <header className="header-gradient text-white shadow-lg">
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
                                    <p className="text-[10px] font-medium tracking-[0.2em] opacity-80 uppercase">Ayuntamiento 2022-2024</p>
                                </div>
                            </div>
                            <div className="h-10 w-[1px] bg-white/20 hidden md:block"></div>
                            <div className="hidden md:block">
                                <h2 className="text-lg font-bold leading-tight">Supervisión Inteligente</h2>
                                <p className="text-sm font-light opacity-90">DIRECCIÓN DE OBRAS PÚBLICAS</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <button
                                onClick={() => setIsDarkMode(!isDarkMode)}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                                title="Cambiar Tema"
                            >
                                <span className="material-symbols-outlined">{isDarkMode ? 'light_mode' : 'dark_mode'}</span>
                            </button>
                            <div
                                className="flex items-center gap-3 pl-2 border-l border-white/20 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => alert('La configuración de usuario aún está bajo construcción.')}
                                title="Perfil de Usuario"
                            >
                                <div className="text-right hidden sm:block">
                                    <p className="text-xs font-bold leading-none">Admin Usuario</p>
                                    <p className="text-[10px] opacity-70">Supervisor General</p>
                                </div>
                                <div className="w-10 h-10 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-xl">person</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="w-full max-w-[1536px] mx-auto px-4 lg:px-8 py-8">
                {/* Title and Filters */}
                <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Panel de Control de Documentación</h3>
                        <p className="text-slate-500 dark:text-slate-400">Estado actual de folios y seguimiento de incidencias administrativas</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
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
                        <button
                            onClick={exportToPDF}
                            className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded text-sm font-bold hover:bg-primary/90 transition-colors shadow"
                        >
                            <span className="material-symbols-outlined text-sm">download</span> {selectedCompany === 'ALL' ? 'Descargar Resumen' : 'Exportar Detalles'}
                        </button>
                    </div>
                </div>

                {/* KPI Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-indigo-500">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Errores Físicos</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100">{kpiData.total}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-primary">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Sin Carpeta / Vacía</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100">{kpiData.sinCarpeta}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-500">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Falta: Inicial</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaInicial}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-500">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Falta: Caja</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaCaja}</h4>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 border-l-red-500">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Falta: Final</p>
                        <h4 className="text-3xl font-black text-slate-800 dark:text-slate-100">{kpiData.faltaFinal}</h4>
                    </div>
                </div>

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

                        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Distribución de Errores</p>
                            <div className="h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={4}
                                            dataKey="value"
                                            animationBegin={200}
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: isDarkMode ? '#262626' : '#fff',
                                                border: isDarkMode ? '1px solid #404040' : '1px solid #e5e5e5',
                                                borderRadius: '8px',
                                                color: isDarkMode ? '#fff' : '#171717'
                                            }}
                                        />
                                        <Legend
                                            verticalAlign="bottom"
                                            height={30}
                                            formatter={(value) => <span className="text-[10px] uppercase font-bold text-slate-500 ml-1">{value}</span>}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Data Table Section */}
                    <div className="xl:col-span-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h5 className="font-bold text-slate-800 dark:text-slate-100">Registros de Incidencias</h5>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => toggleErrorType('ALL')}
                                    className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${selectedErrorTypes.length === 0 ? 'bg-primary text-white border-transparent' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                                >
                                    TODOS
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
                                    <p className="text-sm font-bold uppercase tracking-widest text-primary">Cargando folios...</p>
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
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {tableData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                                <td className="px-6 py-4 font-bold text-primary dark:text-white text-sm">{row.FOLIO}</td>
                                                <td className="px-6 py-4">
                                                    <span
                                                        className="px-2 py-1 rounded text-[10px] font-black uppercase text-white shadow-sm"
                                                        style={{ backgroundColor: getColorForStatus(row.RESULTADO_AUDITORIA) }}
                                                    >
                                                        {row.RESULTADO_AUDITORIA}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{row.CALLE}</td>
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{row.DELEGACION}</td>
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{row.COLONIA}</td>
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
                        </div>
                    </div>
                </div>
            </main>
        </React.Fragment>
    );
};

export default PhotoEvidenceDashboard;
