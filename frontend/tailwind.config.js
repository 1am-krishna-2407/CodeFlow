const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        raised: token('raised'),
        editor: token('editor'),
        line: token('line'),
        fg: token('fg'),
        muted: token('muted'),
        primary: { DEFAULT: token('primary'), hover: token('primary-hover') },
        'on-primary': token('on-primary'),
        accent: token('accent'),
        success: token('success'),
        danger: token('danger'),
        warning: token('warning'),
        info: token('info'),
        running: token('running'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '6px',
        lg: '10px',
      },
    },
  },
  plugins: [],
}
