import { describe, it, expect } from 'vitest';

import { extractDescriptionText, extractGalleryImages } from './dom-extractors.js';

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
