/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        industrial: {
          bg: '#121212',
          surface: '#1E1E1E',
          surfaceHover: '#252525',
          border: '#2A2A2A',
          borderSubtle: '#1F1F1F',
          muted: '#9CA3AF',
        },
        safe: {
          DEFAULT: '#34D399',
          light: '#6EE7B7',
          dark: '#059669',
          bg: 'rgba(52, 211, 153, 0.1)',
        },
        warning: {
          DEFAULT: '#FBBF24',
          light: '#FDE68A',
          dark: '#D97706',
          bg: 'rgba(251, 191, 36, 0.1)',
        },
        critical: {
          DEFAULT: '#EF4444',
          light: '#F87171',
          dark: '#DC2626',
          bg: 'rgba(239, 68, 68, 0.1)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-safe': '0 0 15px rgba(52, 211, 153, 0.25)',
        'glow-warning': '0 0 15px rgba(251, 191, 36, 0.25)',
        'glow-critical': '0 0 20px rgba(239, 68, 68, 0.35)',
      },
    },
  },
  plugins: [],
}
