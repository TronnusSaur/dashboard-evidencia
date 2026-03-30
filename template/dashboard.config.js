/**
 * DASHBOARD TEMPLATE CONFIGURATION
 * Edit this file to customize your dashboad engine.
 */

export const DASHBOARD_CONFIG = {
    title: "SISTEMA DE GESTIÓN",
    subtitle: "PANEL DE CONTROL GENERAL",
    logoText: "STITCH", // Stitch reference as requested
    brandColor: "#7a1531", // Default Deep Wine

    // Define the filters shown in the header
    filters: [
        {
            id: "stage",
            label: "Etapa",
            type: "stage-selector", // Special E1/E2/ALL toggle
            options: ["E1", "E2", "E3", "ALL"]
        },
        {
            id: "company",
            label: "Entidad/Empresa",
            type: "select",
            dataField: "_company"
        },
        {
            id: "contract",
            label: "Sub-Entidad/Contrato",
            type: "select",
            dataField: "_contract",
            dependsOn: "company"
        }
    ],

    // Define the KPI cards at the top
    kpis: [
        {
            label: "Total Incidencias",
            dataKey: "total",
            icon: "warning",
            color: "indigo",
            borderColor: "border-l-indigo-500"
        },
        {
            label: "Estado Crítico",
            dataKey: "sinCarpeta",
            icon: "error",
            color: "red",
            borderColor: "border-l-red-500"
        },
        {
            label: "Pendientes",
            dataKey: "faltaInicial",
            icon: "schedule",
            color: "orange",
            borderColor: "border-l-orange-500"
        }
    ],

    // Chart customization
    visualizations: {
        bar: {
            title: "Distribución por Categorías",
            layout: "horizontal"
        },
        pie: {
            title: "Desglose Porcentual",
            innerRadius: 60,
            outerRadius: 90
        }
    }
};
