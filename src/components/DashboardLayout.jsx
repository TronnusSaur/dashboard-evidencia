import React from 'react';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    AlertTriangle,
    Download,
    Search,
    Bell,
    User,
    Activity,
    CheckCircle,
    Clock
} from 'lucide-react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { SUMMARY_DATA, ERROR_DISTRIBUTION, CATEGORY_DATA } from '../dataMock';

const StatCard = ({ title, value, icon: Icon, delay, trend }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.5 }}
        className="glass-card flex flex-col gap-2"
    >
        <div className="flex justify-between items-start">
            <div className="p-2 bg-white/5 rounded-lg">
                <Icon className="w-5 h-5 text-purple-400" />
            </div>
            {trend && (
                <span className={`text-xs px-2 py-1 rounded-full ${trend > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {trend > 0 ? '+' : ''}{trend}%
                </span>
            )}
        </div>
        <div>
            <p className="text-slate-400 text-sm font-medium">{title}</p>
            <h3 className="text-3xl font-light tracking-tight mt-1">{value}</h3>
        </div>
    </motion.div>
);

const SidebarItem = ({ icon: Icon, label, active }) => (
    <div className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${active ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
        <Icon className="w-5 h-5" />
        <span className="text-sm font-medium">{label}</span>
    </div>
);

const DashboardLayout = () => {
    return (
        <div className="flex min-h-screen">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/10 glass translate-x-0 hidden md:flex flex-col p-6 fixed h-full z-20">
                <div className="flex items-center gap-2 mb-10 px-2">
                    <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 to-blue-500 rounded-lg flex items-center justify-center font-bold">A</div>
                    <span className="font-bold text-lg tracking-tight">AUDIT<span className="text-purple-500">PRO</span></span>
                </div>

                <nav className="space-y-2 flex-1">
                    <SidebarItem icon={LayoutDashboard} label="General" active />
                    <SidebarItem icon={AlertTriangle} label="Errores Críticos" />
                    <SidebarItem icon={Activity} label="Analíticos" />
                    <SidebarItem icon={Clock} label="Historial" />
                </nav>

                <div className="mt-auto pt-6 border-t border-white/10">
                    <SidebarItem icon={Download} label="Exportar" />
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-4 md:p-8">
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold">Auditoría de Imágenes: Reporte Final</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded text-xs font-bold uppercase tracking-wider">Versión V6</span>
                            <span className="text-slate-500 text-xs">Actualizado hace 2 horas</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative hidden sm:block">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Buscar contrato..."
                                className="bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 ring-purple-500/20 w-64"
                            />
                        </div>
                        <button className="p-2 glass hover:bg-white/10 relative">
                            <Bell className="w-5 h-5 text-slate-400" />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-purple-500 rounded-full border-2 border-slate-900"></span>
                        </button>
                        <div className="w-10 h-10 rounded-full border border-white/10 glass flex items-center justify-center cursor-pointer overflow-hidden">
                            <User className="w-6 h-6 text-slate-400" />
                        </div>
                    </div>
                </header>

                {/* KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard title="Folios Totales" value={SUMMARY_DATA.totalExpedientes.toLocaleString()} icon={LayoutDashboard} delay={0.1} />
                    <StatCard title="% de fotos recolectadas" value={`${SUMMARY_DATA.cumplimiento}%`} icon={CheckCircle} delay={0.2} trend={2.4} />
                    <StatCard title="Folios sin Fotos (Crítico)" value={SUMMARY_DATA.erroresCriticos.toLocaleString()} icon={AlertTriangle} delay={0.3} />
                    <StatCard title="Pendientes de foto final" value={SUMMARY_DATA.pendientes.toLocaleString()} icon={Clock} delay={0.4} />
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
                    {/* Distribution Chart */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 }}
                        className="lg:col-span-4 glass p-6"
                    >
                        <h3 className="text-lg font-semibold mb-6">Estatus General</h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={ERROR_DISTRIBUTION}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {ERROR_DISTRIBUTION.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '12px' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>

                    {/* Trend Chart */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.7 }}
                        className="lg:col-span-6 glass p-6"
                    >
                        <h3 className="text-lg font-semibold mb-6">Distribución por Categoría</h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={CATEGORY_DATA}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '12px' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {CATEGORY_DATA.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
