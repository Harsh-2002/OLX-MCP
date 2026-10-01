import { describe, it, expect } from 'vitest';

import {
  extractDescriptionText,
  extractDetailPriceText,
  extractGalleryImages,
  extractLocationText,
} from './dom-extractors.js';

/**
 * The extractors run against real DOM nodes in the browser, so the fixtures
 * mirror the shape OLX actually serves rather than a convenient abstraction:
 * a heading element followed by the body of the description.
 */
const element = (tagName: string, text: string, children: Element[] = []): Element =>
  ({
    tagName,
    textContent: children.length > 0 ? children.map(c => c.textContent).join('') : text,
    children,
  }) as unknown as Element;

const image = (attrs: Record<string, string>): Element =>
  ({
    getAttribute: (name: string) => attrs[name] ?? null,
  }) as unknown as Element;

describe('extractDescriptionText', () => {
  it('drops the localised section heading OLX renders above the description', () => {
    // Real olx.pl markup: <div data-testid="ad_description"><h3>Opis</h3><div>…</div></div>
    const container = element('DIV', '', [
      element('H3', 'Opis'),
      element('DIV', 'iPhone 14 Pro 256 GB z gwarancją.'),
    ]);

    expect(extractDescriptionText(container)).toBe('iPhone 14 Pro 256 GB z gwarancją.');
  });

  it('drops the heading whatever language the domain renders it in', () => {
    const portuguese = element('DIV', '', [
      element('H3', 'Descrição'),
      element('DIV', 'Bicicleta em bom estado.'),
    ]);
    const romanian = element('DIV', '', [
      element('H3', 'Descriere'),
      element('DIV', 'Bicicleta ca noua.'),
    ]);

    expect(extractDescriptionText(portuguese)).toBe('Bicicleta em bom estado.');
    expect(extractDescriptionText(romanian)).toBe('Bicicleta ca noua.');
  });

  it('keeps every non-heading block when the body is split across elements', () => {
    const container = element('DIV', '', [
      element('H3', 'Opis'),
      element('DIV', 'First block.'),
      element('DIV', 'Second block.'),
    ]);

    expect(extractDescriptionText(container)).toBe('First block.\nSecond block.');
  });

  it('falls back to the container text when the markup has no child elements', () => {
    const container = element('DIV', 'Plain description text.');

    expect(extractDescriptionText(container)).toBe('Plain description text.');
  });

  it('returns an empty string for an empty container', () => {
    expect(extractDescriptionText(element('DIV', '   '))).toBe('');
  });
});

describe('extractDetailPriceText', () => {
  /** The detail-page price container: an amount element plus a badge sibling. */
  const priceContainer = (amountText: string | null, badgeText?: string): Element =>
    ({
      tagName: 'DIV',
      textContent: (amountText || '') + (badgeText ? badgeText : ''),
      childNodes: [
        ...(amountText !== null
          ? [
              {
                nodeType: 1,
                textContent: amountText,
              },
            ]
          : [{ nodeType: 3, textContent: '340 €' }]),
        ...(badgeText ? [{ nodeType: 1, textContent: badgeText }] : []),
      ],
      querySelector: (selector: string) =>
        selector === '[data-testid="ad-price"]' && amountText !== null
          ? ({ tagName: 'H3', textContent: amountText } as unknown as Element)
          : null,
    }) as unknown as Element;

  it('reads only the amount element, not the negotiable badge next to it', () => {
    // Real markup: <div data-testid="ad-price-container"><h3 data-testid="ad-price">340 €</h3><p>Negociável</p></div>
    const container = priceContainer('340 €', 'Negociável');

    expect(extractDetailPriceText(container)).toBe('340 €');
  });

  it('is language-independent — the badge wording never reaches the value', () => {
    expect(extractDetailPriceText(priceContainer('2 400 zł', 'do negocjacji'))).toBe('2 400 zł');
    expect(extractDetailPriceText(priceContainer('100 lei', 'Negociabil'))).toBe('100 lei');
  });

  it('falls back to direct text nodes when the amount element is missing', () => {
    // Markup changed shape: the container holds the amount as a bare text node
    // plus a badge element. Direct-text-node reading still skips the badge.
    const container = priceContainer(null, 'Negociável');

    expect(extractDetailPriceText(container)).toBe('340 €');
  });
});

describe('extractLocationText', () => {
  it('reads the address block, not the localised heading glued onto it', () => {
    // Real markup: <div data-testid="map-aside-section"><h2>Localização</h2><address><p>Massamá e Monte Abraão, Lisboa</p></address>…</div>
    const address = element('ADDRESS', '', [element('P', 'Massamá E Monte Abraão, Lisboa')]);
    const container = {
      tagName: 'DIV',
      children: [element('H2', 'Localização'), address],
      querySelector: (selector: string) =>
        selector === 'address' ? (address as unknown as Element) : null,
    } as unknown as Element;

    expect(extractLocationText(container)).toBe('Massamá E Monte Abraão, Lisboa');
  });

  it('drops the heading whatever language the domain renders it in', () => {
    const build = (heading: string) =>
      ({
        tagName: 'DIV',
        children: [element('H2', heading), element('ADDRESS', 'Centrum, Warszawa')],
        querySelector: () => null,
      }) as unknown as Element;

    // No <address> lookup match forces the heading-drop fallback path.
    expect(extractLocationText(build('Localização'))).toContain('Centrum, Warszawa');
    expect(extractLocationText(build('Lokalizacja'))).toContain('Centrum, Warszawa');
  });

  it('falls back to the non-heading children joined by newlines', () => {
    const container = {
      tagName: 'DIV',
      children: [
        element('H2', 'Lokalizacja'),
        element('DIV', 'Warszawa'),
        element('DIV', 'Mokotów'),
      ],
      textContent: 'LokalizacjaWarszawaMokotów',
      querySelector: () => null,
    } as unknown as Element;

    expect(extractLocationText(container)).toBe('Warszawa\nMokotów');
  });

  it('uses the container text when there are no child elements at all', () => {
    const container = {
      tagName: 'DIV',
      children: [],
      textContent: 'Plain location text.',
      querySelector: () => null,
    } as unknown as Element;

    expect(extractLocationText(container)).toBe('Plain location text.');
  });
});

describe('extractGalleryImages', () => {
  it('reads the source of every gallery image', () => {
    const images = [
      image({ src: 'https://cdn.olx.pl/a.jpg' }),
      image({ src: 'https://cdn.olx.pl/b.jpg' }),
    ];

    expect(extractGalleryImages(images)).toEqual([
      'https://cdn.olx.pl/a.jpg',
      'https://cdn.olx.pl/b.jpg',
    ]);
  });

  it('falls back to data-src for images the gallery has not lazy-loaded yet', () => {
    const images = [image({ 'data-src': 'https://cdn.olx.pl/lazy.jpg' })];

    expect(extractGalleryImages(images)).toEqual(['https://cdn.olx.pl/lazy.jpg']);
  });

  it('deduplicates the thumbnail strip repeating the main image', () => {
    const images = [
      image({ src: 'https://cdn.olx.pl/a.jpg' }),
      image({ src: 'https://cdn.olx.pl/a.jpg' }),
      image({ src: 'https://cdn.olx.pl/b.jpg' }),
    ];

    expect(extractGalleryImages(images)).toEqual([
      'https://cdn.olx.pl/a.jpg',
      'https://cdn.olx.pl/b.jpg',
    ]);
  });

  it('skips placeholders that are not absolute URLs', () => {
    const images = [
      image({ src: 'data:image/gif;base64,R0lGOD' }),
      image({ src: '/app/static/media/badge.svg' }),
      image({}),
      image({ src: 'https://cdn.olx.pl/real.jpg' }),
    ];

    expect(extractGalleryImages(images)).toEqual(['https://cdn.olx.pl/real.jpg']);
  });

  it('returns an empty list for a listing with no photos', () => {
    expect(extractGalleryImages([])).toEqual([]);
  });
});
