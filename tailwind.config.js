/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class', // Enable class-based dark mode
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                "primary": "#7a1531",
                "background-light": "#f8f6f6",
                "background-dark": "#1a1a1a",
                slate: {
                    50: '#fafafa',
                    100: '#f5f5f5',
                    200: '#e5e5e5',
                    300: '#d4d4d4',
                    400: '#a3a3a3',
                    500: '#737373',
                    600: '#525252',
                    700: '#3d3d3d',
                    800: '#2b2b2b',
                    900: '#1a1a1a',
                    950: '#0a0a0a',
                }
            },
            fontFamily: {
                sans: ['"Public Sans"', 'sans-serif'],
                display: ['"Public Sans"', 'sans-serif']
            },
        },
    },
    plugins: [],
}
