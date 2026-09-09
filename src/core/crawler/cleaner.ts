import * as cheerio from 'cheerio';

export interface CleanedPage {
  title: string;
  metaDescription?: string;
  headings: string[];
  cleanText: string;
  wordCount: number;
}

const DEFAULT_MAX_CHARS = 15000;

// Tags to completely strip from DOM
const STRIP_TAGS = [
  'script',
  'style',
  'nav',
  'footer',
  'header',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'form',
  'dialog',
  'select',
  'option',
  'button',
  'input',
];

// Noise selectors
const NOISE_SELECTORS = [
  '.cookie-banner',
  '.cookie-consent',
  '.cookies-notice',
  '#cookie-notice',
  '#cookie-banner',
  '.modal',
  '.popup',
  '.advertisement',
  '.ad',
  '.social-share',
  '.menu-overlay',
  '[aria-hidden="true"]',
  '[hidden]',
];

/**
 * Cleans raw HTML and extracts semantic text, headings, and metadata.
 */
export function cleanHtml(html: string, maxChars: number = DEFAULT_MAX_CHARS): CleanedPage {
  if (!html || typeof html !== 'string' || html.trim().length === 0) {
    return {
      title: '',
      headings: [],
      cleanText: '',
      wordCount: 0,
    };
  }

  const $ = cheerio.load(html);

  // 1. Extract Title
  const rawTitle =
    $('title').first().text() ||
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    '';
  const title = rawTitle.replace(/\s+/g, ' ').trim();

  // 2. Extract Meta Description
  const rawDesc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    undefined;
  const metaDescription = rawDesc ? rawDesc.replace(/\s+/g, ' ').trim() : undefined;

  // 3. Extract Headings before stripping
  const headings: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && text.length > 2 && text.length < 200 && !headings.includes(text)) {
      headings.push(text);
    }
  });

  // 4. Strip boilerplate tags
  for (const tag of STRIP_TAGS) {
    $(tag).remove();
  }

  // 5. Strip noise elements
  for (const selector of NOISE_SELECTORS) {
    $(selector).remove();
  }

  // Also remove elements with inline display:none or visibility:hidden
  $('[style*="display: none"], [style*="display:none"], [style*="visibility: hidden"]').remove();

  // 6. Prefer semantic containers if present and rich
  let container: cheerio.Cheerio<any> = $('body');
  const mainEl = $('main');
  const articleEl = $('article');
  const contentEl = $('#content, .content, #main-content');

  if (mainEl.length && mainEl.text().trim().length > 100) {
    container = mainEl;
  } else if (articleEl.length && articleEl.text().trim().length > 100) {
    container = articleEl;
  } else if (contentEl.length && contentEl.text().trim().length > 100) {
    container = contentEl.first();
  }

  // 7. Extract text with paragraph / list formatting
  // Replace block elements with linebreaks to retain structural separation
  container.find('p, div, li, tr, br, section').each((_, el) => {
    $(el).append('\n');
  });

  let rawText = container.text();

  // 8. Whitespace normalization:
  // - Replace non-breaking spaces with standard space
  // - Collapse multiple spaces/tabs into a single space per line
  // - Collapse multiple newlines into max 2 newlines (paragraph break)
  rawText = rawText
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  // 9. Budget truncation
  let cleanText = rawText;
  if (cleanText.length > maxChars) {
    // Truncate at last space before maxChars
    const truncated = cleanText.slice(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    cleanText = (lastSpace > maxChars * 0.8 ? truncated.slice(0, lastSpace) : truncated) + '...';
  }

  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

  return {
    title,
    metaDescription,
    headings,
    cleanText,
    wordCount,
  };
}
