'use strict';

const i18next = require('i18next');

const SUPPORTED = ['de', 'en'];
const DEFAULT_LANG = 'de';

const resources = {
  de: {
    translation: {
      appName: 'Buchtausch',
      tagline: 'Bücher tauschen statt kaufen.',
      metaDescription:
        'Buchtausch: Registrierte Nutzerinnen und Nutzer tauschen Bücher und bekommen passende Vorschläge.',
      intro:
        'Hier tauschen registrierte Nutzerinnen und Nutzer Bücher miteinander. Du gibst an, welche Bücher und Themen dich interessieren und welche Bücher du abgeben möchtest – die Plattform schlägt passende Bücher anderer Mitglieder vor.',
      comingSoon: 'Diese Seite ist im Aufbau. Registrierung und Vorschläge folgen bald.',
      navHome: 'Start',
      navMain: 'Hauptnavigation',
      languageLabel: 'Sprache',
      switchTo: 'English',
      demoHeading: 'Demo-Daten (nur Vorschau)',
      demoNote: 'Diese Beispieldaten erscheinen nur im Entwicklungsmodus.',
      by: 'von',
      footer: 'Buchtausch – eine Plattform zum Tauschen von Büchern.',
    },
  },
  en: {
    translation: {
      appName: 'Book Exchange',
      tagline: 'Swap books instead of buying them.',
      metaDescription:
        'Book Exchange: registered users swap books with each other and get matching suggestions.',
      intro:
        'Registered users exchange books with each other here. Tell us which books and topics interest you and which books you want to trade – the platform suggests matching books from other members.',
      comingSoon: 'This site is under construction. Registration and suggestions are coming soon.',
      navHome: 'Home',
      navMain: 'Main navigation',
      languageLabel: 'Language',
      switchTo: 'Deutsch',
      demoHeading: 'Demo data (preview only)',
      demoNote: 'This sample data is only shown in development mode.',
      by: 'by',
      footer: 'Book Exchange – a platform for swapping books.',
    },
  },
};

const i18n = i18next.createInstance();
i18n.init({
  resources,
  lng: DEFAULT_LANG,
  fallbackLng: DEFAULT_LANG,
  supportedLngs: SUPPORTED,
  initAsync: false, // i18next >= 24
  initImmediate: false, // older i18next
  interpolation: { escapeValue: false }, // Nunjucks autoescapes
  showSupportNotice: false,
});

function normalize(value) {
  if (!value) return null;
  const short = String(value).trim().toLowerCase().slice(0, 2);
  return SUPPORTED.includes(short) ? short : null;
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/** Pick language: ?lang= → cookie "lang" → Accept-Language → de. */
function detectLanguage(req) {
  const fromQuery = normalize(req.query && req.query.lang);
  if (fromQuery) return { lang: fromQuery, fromQuery: true };
  const fromCookie = normalize(readCookie(req.headers.cookie, 'lang'));
  if (fromCookie) return { lang: fromCookie, fromQuery: false };
  const fromHeader = req.headers['accept-language'] ? normalize(req.acceptsLanguages(...SUPPORTED)) : null;
  return { lang: fromHeader || DEFAULT_LANG, fromQuery: false };
}

function i18nMiddleware(req, res, next) {
  const { lang, fromQuery } = detectLanguage(req);
  if (fromQuery) {
    // Strictly necessary preference cookie (no tracking).
    res.cookie('lang', lang, { maxAge: 365 * 24 * 3600 * 1000, httpOnly: true, sameSite: 'lax' });
  }
  res.locals.lang = lang;
  res.locals.altLang = lang === 'de' ? 'en' : 'de';
  res.locals.t = i18n.getFixedT(lang);
  res.locals.supportedLangs = SUPPORTED;
  next();
}

module.exports = { i18n, i18nMiddleware, detectLanguage, SUPPORTED, DEFAULT_LANG };
