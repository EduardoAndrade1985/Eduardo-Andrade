// Cada APK se identifica no user agent (appendUserAgent no capacitor.config),
// ex.: "RPHubApp/enxoval". O mesmo site atende vários APKs, cada um preso ao
// seu módulo; no navegador não há marca e todos os módulos ficam disponíveis.
const marca = typeof navigator !== 'undefined'
  ? navigator.userAgent.match(/RPHubApp\/([a-z-]+)/)
  : null

export const moduloDoApp = marca ? marca[1] : null

export const rotaInicial = moduloDoApp ? `/${moduloDoApp}` : '/custos'
