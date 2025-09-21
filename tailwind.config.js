/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        'accent': '#8B5CF6',
        'background': '#0C0B0E',
        'surface': {
          'default': 'rgba(255, 255, 255, 0.05)',
          'hover': 'rgba(255, 255, 255, 0.08)',
          'pressed': 'rgba(255, 255, 255, 0.12)',
          'solid': '#1a1a1f', // Solid dark surface for modals
        },
        'card': {
          'dark': '#18181b', // Solid dark card background
          'darker': '#0f0f12', // Even darker variant
        },
        'border': {
          'subtle': 'rgba(255, 255, 255, 0.1)',
          'default': 'rgba(255, 255, 255, 0.2)',
        },
        'foreground': 'rgba(242, 241, 244, 1)',
        'muted': 'rgba(255, 255, 255, 0.6)',
        'success': '#91F98C',
        'destructive': '#DD5555',
        'warning': '#f59e0b',
      },
      fontFamily: {
        'primary': ['Space Grotesk', 'Noto Sans', 'sans-serif'],
        'secondary': ['Sora', 'Noto Sans', 'sans-serif'],
        'mono': ['Courier New', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
      }
    },
  },
  plugins: [],
}