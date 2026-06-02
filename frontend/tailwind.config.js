/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'var(--color-bg)',
        bg2:     'var(--color-bg2)',
        bg3:     'var(--color-bg3)',
        border:  'var(--color-border)',
        primary: 'var(--color-primary)',
        warn:    'var(--color-warn)',
        danger:  'var(--color-danger)',
        muted:   'var(--color-muted)',
        dim:     'var(--color-dim)',
      },
    },
  },
  plugins: [],
}
