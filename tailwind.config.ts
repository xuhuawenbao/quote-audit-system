import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1a365d',
        accent: '#2b6cb0',
        success: '#38a169',
        danger: '#e53e3e',
        warning: '#d69e2e',
      }
    },
  },
  plugins: [],
}
export default config
