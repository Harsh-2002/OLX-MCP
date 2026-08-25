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
