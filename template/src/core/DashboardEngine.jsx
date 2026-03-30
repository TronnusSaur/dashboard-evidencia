import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { FILTERS_MAP, ERROR_TYPES, RESUMEN_DATA } from '../dataMock';
import { DASHBOARD_CONFIG } from '../../dashboard.config';

const DashboardEngine = () => {
    const [selectedStage, setSelectedStage] = useState('ALL');
    const [selectedCompany, setSelectedCompany] = useState('ALL');
    const [selectedContract, setSelectedContract] = useState('ALL');
    const [selectedDelegation, setSelectedDelegation] = useState('ALL');
    const [records, setRecords] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);

    // Fetching data logic based on configuration
    useEffect(() => {
        const fetchRecords = async () => {
            setIsLoading(true);
            let allRecords = [];
            try {
                const stagesToFetch = selectedStage === 'ALL' ? ['E1', 'E2'] : [selectedStage];
                const promises = [];

                stagesToFetch.forEach(st => {
                    const stageSummary = RESUMEN_DATA.filter(r => r._stage === st);
                    stageSummary.forEach(contractInfo => {
                        promises.push(
                            fetch(`/contratos/${st}_${contractInfo.EMPRESA_RAIZ_MASTER}_${contractInfo.ID}.json`)
                                .then(res => res.ok ? res.json().then(data => data.map(item => ({
                                    ...item,
                                    _company: contractInfo.EMPRESA_RAIZ_MASTER,
                                    _contract: contractInfo.ID,
                                    _stage: st
                                }))) : [])
                        );
                    });
                });

                const results = await Promise.all(promises);
                allRecords = results.flat();
                setRecords(allRecords);
            } catch (error) {
                console.error("DashboardEngine: Error fetching records:", error);
                setRecords([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchRecords();
    }, [selectedStage]);

    // Data filtering
    const filteredRecords = useMemo(() => {
        let filtered = records;
        if (selectedStage !== 'ALL') filtered = filtered.filter(r => r._stage === selectedStage);
        if (selectedCompany !== 'ALL') filtered = filtered.filter(r => r._company === selectedCompany);
        if (selectedContract !== 'ALL') filtered = filtered.filter(r => r._contract === selectedContract);
        if (selectedDelegation !== 'ALL') filtered = filtered.filter(r => r.DELEGACION === selectedDelegation);
        return filtered;
    }, [records, selectedStage, selectedCompany, selectedContract, selectedDelegation]);

    // Rendering dynamic layout
    return (
        <div className={isDarkMode ? 'dark' : ''}>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
                {/* Header (Powered by Stitch) */}
                <header className="p-6 bg-white dark:bg-slate-800 shadow-sm flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold uppercase tracking-tight text-slate-800 dark:text-white">
                            {DASHBOARD_CONFIG.title}
                        </h1>
                        <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase opacity-70">
                            {DASHBOARD_CONFIG.subtitle}
                        </p>
                    </div>

                    {/* The Stitch Reference */}
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Powered by</span>
                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-black tracking-widest">{DASHBOARD_CONFIG.logoText}</span>
                    </div>
                </header>

                <main className="p-8 max-w-[1600px] mx-auto">
                    {/* Dynamic Filters Area */}
                    {/* Dynamic KPI Cards Area */}
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                        {DASHBOARD_CONFIG.kpis.map((kpi, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm border-l-4 ${kpi.borderColor}`}
                            >
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{kpi.label}</p>
                                <h4 className="text-3xl font-black text-slate-800 dark:text-white">Calculando...</h4>
                            </motion.div>
                        ))}
                    </div>

                    {/* Chart Sections here... */}
                </main>
            </div>
        </div>
    );
};

export default DashboardEngine;
