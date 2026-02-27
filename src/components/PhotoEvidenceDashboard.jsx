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

    const companies = useMemo(() => ['ALL', ...Object.keys(FILTERS_MAP)], []);

    const contracts = useMemo(() => {
        if (selectedCompany === 'ALL') return ['ALL'];
        return ['ALL', ...(FILTERS_MAP[selectedCompany] || [])];
    }, [selectedCompany]);

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
        if (tableData.length === 0) {
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

            // Add General Summary Section if General
            if (selectedCompany === 'ALL') {
                doc.addPage();
                doc.setFontSize(16);
                doc.setTextColor(139, 92, 246);
                doc.text("Resumen Ejecutivo de Auditoría", 14, 25);

                const totalOmisiones = RESUMEN_DATA.reduce((acc, row) => acc + row.TOTAL_OMISIONES, 0);

                doc.setFontSize(11);
                doc.setTextColor(60);
                doc.text(`Total de folios observados: ${totalOmisiones}`, 14, 35);

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
                    startY: 45,
                    theme: 'striped',
                    headStyles: { fillColor: [139, 92, 246] },
                    styles: { fontSize: 10 }
                });

                // Detailed Summary Section
                doc.setFontSize(14);
                doc.text("Desglose por Empresa Raíz", 14, doc.lastAutoTable.finalY + 15);

                const companyColumn = ["Empresa", "Faltan", "Total"];
                const companyRows = RESUMEN_DATA.map(row => [
                    row.EMPRESA_RAIZ_MASTER,
                    row.TOTAL_OMISIONES,
                    row.TOTAL_OMISIONES
                ]);

                autoTable(doc, {
                    head: [companyColumn],
                    body: companyRows,
                    startY: doc.lastAutoTable.finalY + 20,
                    theme: 'grid',
                    headStyles: { fillColor: [71, 85, 105] },
                    styles: { fontSize: 8 }
                });
            }

            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, doc.lastAutoTable.finalY + 10);

            window.open(doc.output('bloburl'), '_blank');
            doc.save(`Resumen_Auditoria_${new Date().getTime()}.pdf`);
        } catch (error) {
            console.error('PDF Export Error:', error);
            alert('Error al generar el documento pdf.');
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-20">
            {/* Alert Notification */}
            <AnimatePresence>
                {showAlert && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 20 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] bg-red-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-red-400"
                    >
                        <AlertOctagon className="w-5 h-5" />
                        <span className="font-semibold">¡No hay registros para exportar!</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header & Filters */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        Control de Evidencia Fotográfica
                    </h1>
                    <p className="text-slate-400 mt-1 flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Toluca, Estado de México
                    </p>
                </div>

                <div className="flex flex-wrap gap-4 w-full lg:w-auto">
                    <button
                        onClick={exportToPDF}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all transform hover:scale-105 active:scale-95"
                    >
                        <FileText className="w-4 h-4 text-purple-400" />
                        Exportar Resumen
                    </button>
                    {/* Primary Filter */}
                    <div className="flex-1 lg:flex-none">
                        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Empresa Raíz</label>
                        <div className="relative">
                            <select
                                value={selectedCompany}
                                onChange={(e) => handleCompanyChange(e.target.value)}
                                className="w-full lg:w-48 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 ring-purple-500/20 cursor-pointer"
                            >
                                {companies.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        </div>
                    </div>

                    {/* Secondary Filter */}
                    <div className="flex-1 lg:flex-none">
                        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Contrato (ID)</label>
                        <div className="relative">
                            <select
                                value={selectedContract}
                                onChange={(e) => setSelectedContract(e.target.value)}
                                disabled={selectedCompany === 'ALL'}
                                className="w-full lg:w-48 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 ring-purple-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {contracts.map(id => <option key={id} value={id} className="bg-slate-900">{id === 'ALL' ? 'TODOS' : id}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Dashboard Content */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Visualizations Row */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="lg:col-span-5 glass-card p-6"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <PieIcon className="w-5 h-5 text-purple-400" />
                        <h3 className="font-semibold text-lg">Distribución de Errores</h3>
                    </div>
                    <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={110}
                                    paddingAngle={8}
                                    dataKey="value"
                                    animationBegin={200}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    formatter={(value) => <span className="text-xs text-slate-300 ml-1">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="lg:col-span-7 glass-card p-6"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart3 className="w-5 h-5 text-blue-400" />
                        <h3 className="font-semibold text-lg">
                            {selectedContract !== 'ALL' ? `Detalle: Contrato ${selectedContract}` : selectedCompany !== 'ALL' ? `Contratos: ${selectedCompany}` : 'General: Conteo de Faltantes'}
                        </h3>
                    </div>
                    <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} layout="horizontal" margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    stroke="#64748b"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    angle={barData.length > 5 ? -45 : 0}
                                    textAnchor={barData.length > 5 ? "end" : "middle"}
                                    height={60}
                                />
                                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Bar
                                    dataKey="value"
                                    radius={[6, 6, 0, 0]}
                                    barSize={barData.length < 5 ? 80 : 40}
                                >
                                    {barData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Table Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="lg:col-span-12 glass-card overflow-hidden"
                >
                    <div className="p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-2">
                            <TableIcon className="w-5 h-5 text-slate-400" />
                            <h3 className="font-semibold text-lg">Detalle de Folios</h3>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => toggleErrorType('ALL')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedErrorTypes.length === 0 ? 'bg-white/10 text-white border border-white/20' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                TODOS
                            </button>
                            {CONDENSED_CATEGORIES.map(type => (
                                <button
                                    key={type}
                                    onClick={() => toggleErrorType(type)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${selectedErrorTypes.includes(type)
                                        ? 'text-white'
                                        : 'text-slate-500 border-transparent hover:text-slate-300'
                                        }`}
                                    style={selectedErrorTypes.includes(type) ? {
                                        backgroundColor: `${getColorForStatus(type)}20`,
                                        borderColor: `${getColorForStatus(type)}40`,
                                        color: getColorForStatus(type)
                                    } : {}}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>

                        <div className="px-3 py-1 bg-white/5 rounded-full text-xs text-slate-400 border border-white/10">
                            {tableData.length} registros encontrados
                        </div>
                    </div>

                    <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center p-20 text-slate-500 gap-4">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                                <p className="text-lg font-medium text-slate-400">Cargando folios...</p>
                            </div>
                        ) : tableData.length > 0 ? (
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white/5 text-slate-400 uppercase text-[10px] tracking-widest sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-4 font-bold">Folio</th>
                                        <th className="px-6 py-4 font-bold">Error</th>
                                        <th className="px-6 py-4 font-bold">Calle</th>
                                        <th className="px-6 py-4 font-bold">Delegación</th>
                                        <th className="px-6 py-4 font-bold">Colonia</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {tableData.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4 font-mono font-medium text-purple-400">{row.FOLIO}</td>
                                            <td className="px-6 py-4">
                                                <span
                                                    className="px-2 py-1 rounded text-[10px] font-bold uppercase border"
                                                    style={{
                                                        backgroundColor: `${getColorForStatus(row.RESULTADO_AUDITORIA)}20`,
                                                        color: getColorForStatus(row.RESULTADO_AUDITORIA),
                                                        borderColor: `${getColorForStatus(row.RESULTADO_AUDITORIA)}40`
                                                    }}
                                                >
                                                    {row.RESULTADO_AUDITORIA}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-300">{row.CALLE}</td>
                                            <td className="px-6 py-4 text-slate-400 cursor-help" title="Delegación">{row.DELEGACION}</td>
                                            <td className="px-6 py-4 text-slate-400">{row.COLONIA}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-20 text-slate-500 gap-4">
                                <AlertCircle className="w-12 h-12 opacity-20" />
                                <div className="text-center">
                                    <p className="text-lg font-medium text-slate-400">Sin datos seleccionados</p>
                                    <p className="text-sm">Selecciona una empresa para visualizar el desglose de folios o verifica los filtros aplicados.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Floating Action Button for PDF Export */}
            <motion.button
                whileHover={{ scale: 1.1, rotate: -5 }}
                whileTap={{ scale: 0.9 }}
                onClick={exportToPDF}
                className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-tr from-red-600 to-rose-400 rounded-full shadow-2xl flex items-center justify-center text-white z-50 group"
            >
                <FileText className="w-6 h-6 group-hover:animate-pulse" />
                <div className="absolute bottom-full right-0 mb-4 bg-slate-900 text-white text-[10px] px-2 py-1 rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Exportar PDF ({tableData.length} folios)
                </div>
            </motion.button>
        </div>
    );
};

export default PhotoEvidenceDashboard;
