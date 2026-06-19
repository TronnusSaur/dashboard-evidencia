# Dashboard Engine Template 🚀

Este template permite generar dashboards de gestión de estados y auditoría a partir de cualquier estructura de datos JSON.

## Cómo Utilizar este Template

### 1. Preparar tus Datos
Dento de la carpeta `dashboard_resources/`, coloca tus archivos JSON siguiendo esta estructura de nombres: 
`[ETAPA]_[EMPRESA]_[ID_CONTRATO].json`

### 2. Configurar el Dashboard
Edita el archivo `dashboard.config.js` en la raíz de la carpeta `template/`. Aquí puedes personalizar:
- **Títulos y Logos**: Cambiar el nombre del proyecto y de la marca (Ej: "STITCH").
- **Colores de Marca**: El color base para gráficas y PDF.
- **Filtros Dinámicos**: Define los campos de tus datos que deben aparecer como filtros.
- **KPI Cards**: Define qué métricas deben aparecer en las tarjetas superiores.

### 3. Procesar los Datos
Ejecuta el script de procesamiento de datos:
```bash
npm run process
```
Este script leerá tu carpeta de recursos y generará el archivo `dataMock.js` de forma automática.

### 4. Ejecutar
Inicia el dashboard con:
```bash
npm run dev
```

## Estructura de Carpetas

- `src/core/DashboardEngine.jsx`: El motor visual principal (Agnóstico de datos).
- `src/components/common/`: Componentes reutilizables (StatCards, Filtros, Gráficas).
- `scripts/processReport.js`: El script de normalización de datos.

---
*Powered by Stitch 🧵 (Built for Speed and Efficiency)*
