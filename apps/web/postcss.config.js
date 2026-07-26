module.exports = {
  plugins: {
    // Tailwind 4 ships as a PostCSS plugin; there is no tailwind.config.js.
    // Theme configuration lives in CSS — see libs/shared/ui/src/styles/tokens.css.
    '@tailwindcss/postcss': {},
  },
};
