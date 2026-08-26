/**
 * Extractors that Playwright evaluates inside the page.
 *
 * Playwright serialises these to source and runs them in the browser, where no
 * module scope exists. Each one must therefore be self-contained: no imports,
 * no closures, and no calls between them.
 */

/**
 * OLX wraps the description in a container that opens with a localised section
 * heading — "Opis", "Descrição", "Descriere". Reading the container's
 * textContent prefixed that heading onto every description, so the heading
 * elements are dropped and only the body blocks are read. Matching on the tag
 * rather than the words keeps this working on all five domains.
 */
export const extractDescriptionText = (container: Element): string => {
  const body = Array.from(container.children).filter(child => !/^H[1-6]$/.test(child.tagName));

  // No child elements means the markup is a plain text node, not a heading plus
  // a body, and the container's own text is the description.
  const text =
    body.length > 0 ? body.map(child => child.textContent || '').join('\n') : container.textContent;

  return (text || '').trim();
};

/**
 * The detail-page price container holds both the amount and a sibling badge
 * ("Negociável", "do negocjacji", ...) that the container's own textContent
 * would glue onto the amount — reading as "340 €Negociável". The amount
 * carries the same `ad-price` testid it has on search cards, so that element
 * is preferred; when the markup changes shape, fall back to the container's
 * direct text nodes only.
 */
export const extractDetailPriceText = (container: Element): string => {
  const amount = container.querySelector('[data-testid="ad-price"]');
  if (amount) return (amount.textContent || '').trim();

  const ownText = Array.from(container.childNodes)
    .filter(node => node.nodeType === 3)
    .map(node => node.textContent || '')
    .join('')
    .trim();
  if (ownText) return ownText;

  return (container.textContent || '').trim();
};

/**
 * The map section opens with a localised heading — "Localização",
 * "Lokalizacja", "Locație" — that the container's textContent would prepend
 * to the value, reading as "LocalizaçãoMassamá …". The address itself lives
 * in an <address> block; when there is none, heading elements are dropped
 * the same way extractDescriptionText handles the description heading.
 */
export const extractLocationText = (container: Element): string => {
  const address = container.querySelector('address');
  if (address) return (address.textContent || '').trim();

  const body = Array.from(container.children).filter(child => !/^H[1-6]$/.test(child.tagName));
  const text =
    body.length > 0 ? body.map(child => child.textContent || '').join('\n') : container.textContent;

  return (text || '').trim();
};

/**
 * Gallery sources, in page order. `data-src` covers slides the gallery has not
 * lazy-loaded yet, and non-absolute values are dropped: those are inline
 * placeholders and static badge assets, not photos of the item.
 */
export const extractGalleryImages = (images: Element[]): string[] => {
  const urls = images
    .map(image => image.getAttribute('src') || image.getAttribute('data-src') || '')
    .filter(url => url.startsWith('http://') || url.startsWith('https://'));

  // The thumbnail strip repeats the slides it scrolls through.
  return Array.from(new Set(urls));
};
