# Sistema de Diseño e Identidad Visual (FAST DASHBOARDS)

Este documento contiene la copia exacta y completa de los estilos del proyecto, junto con anotaciones clave para que cualquier Inteligencia Artificial o desarrollador pueda entender y replicar con exactitud el diseño de esta web en un proyecto nuevo. 

El diseño se basa en **TailwindCSS** complementado con **CSS puro** para animaciones, barras de desplazamiento (scrollbars) y gradientes complejos (Glassmorphism).

---

## 1. Configuración de Tailwind (`tailwind.config.js`)
*Instrucción para el nuevo proyecto:* Debes inicializar Tailwind con esta configuración para heredar los colores corporativos (Vino/Rojo), los fondos globales y la tipografía `Public Sans`.

```javascript
/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class', // Es vital mantener 'class' para controlar el modo oscuro manualmente
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Color corporativo (Vino Toluca)
                "primary": "#7a1531", 
                
                // Fondos base para garantizar contraste
                "background-light": "#f8f6f6",
                "background-dark": "#1a1a1a",
                
                // Escala de grises estricta para el resto de la UI
                slate: {
                    50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5',
                    300: '#d4d4d4', 400: '#a3a3a3', 500: '#737373',
                    600: '#525252', 700: '#3d3d3d', 800: '#2b2b2b',
                    900: '#1a1a1a', 950: '#0a0a0a',
                }
            },
            fontFamily: {
                // El diseño requiere la fuente Public Sans de Google Fonts
                sans: ['"Public Sans"', 'sans-serif'],
                display: ['"Public Sans"', 'sans-serif']
            },
        },
    },
    plugins: [],
}
```

---

## 2. Hoja de Estilos Global y Personalizada (`index.css`)
*Instrucción para el nuevo proyecto:* Copia todo este código en el archivo CSS global. Este archivo contiene los secretos visuales del proyecto: scrollbars minimalistas, auras y gradientes radiales para fondos.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ----------------------------------------------------
   1. CONFIGURACIÓN BASE Y SCROLLBARS MINIMALISTAS
   ---------------------------------------------------- */
body {
  margin: 0;
  min-height: 100vh;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(122, 21, 49, 0.2); /* Tono primary diluido */
  border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(122, 21, 49, 0.4);
}

/* Modo oscuro para scrollbars */
.dark ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); }
.dark ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

/* ----------------------------------------------------
   2. CABECERA PRINCIPAL (HEADER) Y GLASSMORPHISM
   ---------------------------------------------------- */
@layer utilities {
  /* Gradiente principal del corporativo */
  .header-gradient {
    background: linear-gradient(135deg, #7a1531 0%, #5a0f24 100%);
    position: relative;
    overflow: hidden;
    transition: background 0.3s ease;
  }

  .dark .header-gradient {
    background: linear-gradient(135deg, #3a1520 0%, #260f15 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  /* Variante: Cabecera Modo Supervisor (Ámbar oscuro) */
  .header-gradient-supervisor {
    background: linear-gradient(135deg, #78350f 0%, #451a03 60%, #7a1531 100%) !important;
    position: relative;
    overflow: hidden;
    transition: background 0.6s ease;
  }
  
  .dark .header-gradient-supervisor {
    background: linear-gradient(135deg, #3a200a 0%, #1c0a02 60%, #3a1520 100%) !important;
    border-bottom: 1px solid rgba(245, 158, 11, 0.1);
  }

  /* Círculos decorativos para el fondo del header (Efecto profundidad) */
  .semi-circle-1 {
    position: absolute; width: 300px; height: 300px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 70%);
    top: -150px; right: -50px;
  }

  .semi-circle-2 {
    position: absolute; width: 200px; height: 200px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 70%);
    bottom: -100px; left: 10%;
  }
}

/* ----------------------------------------------------
   3. BOTONES Y SELECTORES CON BLUR EFECT
   ---------------------------------------------------- */
.drive-mode-selector {
  display: flex;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px); /* Cristal */
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px; padding: 3px; gap: 2px;
}

.drive-mode-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 12px; border-radius: 8px; font-size: 11px; font-weight: 800;
  color: rgba(255, 255, 255, 0.6); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-transform: uppercase; letter-spacing: 0.05em; background: transparent; cursor: pointer;
}

.drive-mode-btn:hover { color: rgba(255, 255, 255, 0.9); background: rgba(255, 255, 255, 0.06); }
.drive-mode-btn.active.admin-active {
  background: rgba(255, 255, 255, 0.18); color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.drive-mode-btn.active.supervisor-active {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(217, 119, 6, 0.2));
  color: #fbbf24;
  box-shadow: 0 2px 12px rgba(245, 158, 11, 0.3), inset 0 1px 0 rgba(251, 191, 36, 0.2);
}

/* ----------------------------------------------------
   4. BARRAS DE PROGRESO ANIMADAS (SHIMMER)
   ---------------------------------------------------- */
.sync-progress-container {
  flex: 1; min-width: 200px; height: 22px; border-radius: 11px; overflow: hidden;
  position: relative; background: #f1f5f9; border: 1px solid #e2e8f0;
}
.dark .sync-progress-container { background: #1e293b; border-color: #475569; }

.sync-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #7a1531, #b91c5c, #7a1531);
  background-size: 200% 100%;
  animation: syncShimmer 1.5s ease infinite; /* Animación continua de brillo */
  border-radius: 11px; transition: width 0.3s ease; box-shadow: 0 0 12px rgba(122, 21, 49, 0.4);
}

.sync-progress-text {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800; text-transform: uppercase; mix-blend-mode: difference; color: white;
}

@keyframes syncShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ----------------------------------------------------
   5. TARJETAS Y COMPONENTES NEÓN / PULSE
   ---------------------------------------------------- */
.supervisor-aura { position: relative; }
.supervisor-aura::before {
  content: ''; position: absolute; inset: -1px; border-radius: inherit; border: 2px solid transparent;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(251, 191, 36, 0.08), rgba(245, 158, 11, 0.25)) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor;
  pointer-events: none; animation: auralPulse 3s ease-in-out infinite;
}

@keyframes auralPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

/* Tarjetas Flash Hover Effect */
.kpi-card { position: relative; overflow: hidden; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.kpi-card::after {
  content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
  transition: left 0.6s ease;
}
.kpi-card.flash::after { left: 100%; }
```

---

## 3. Filosofía de Estructura de Componentes (Instrucciones para la nueva IA/Dev)

Cuando vayas a crear componentes en el nuevo proyecto, **utiliza estrictamente la siguiente jerarquía visual en Tailwind**:

1. **Estructura Global:** El contenedor principal de las vistas nunca ocupa el 100% expansivo extremo. Utiliza siempre `max-w-[1536px] mx-auto px-4 lg:px-8` para centrar el contenido en pantallas ultra anchas, tal como se hace en la cabecera y el main de este proyecto.
2. **Botones de Acción Primarios:** `bg-primary text-white border-transparent hover:bg-opacity-90`
3. **Botones Secundarios:** `bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600`
4. **Sombras y Fondos de Contenedor (Cards):** Usa sombras muy sutiles: `shadow-sm border border-slate-200 dark:border-slate-700`. El fondo de las tarjetas debe ser siempre `bg-white dark:bg-slate-800`. Nunca uses negro puro en los contenedores.
5. **Píldoras o Indicadores de Estado:** Usa colores pasteles en modo light y opacidades al 30% en modo oscuro. Ejemplo de badge azul: `bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400`.
6. **Tipografía y Etiquetas (Labels):** Utiliza extensamente el formato `uppercase tracking-wider font-bold` con tamaño `text-[10px]` o `text-xs` para los encabezados de tablas, títulos de selectores o sub-etiquetas. La legibilidad de pequeñas mayúsculas espaciadas es una firma clave del diseño de este panel.
