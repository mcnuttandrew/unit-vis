/**
 * jsdom will not fetch an image, so nothing ever fires `onload` and vega's
 * resource loader -- which every render waits on -- waits forever. This stands
 * in an image that reports itself loaded as soon as it is pointed somewhere,
 * which is all the renderer needs from it: the mark is drawn at the size the
 * encoding gives, and the url is copied onto the element as it stands.
 *
 * Call it from a `beforeAll` in any suite that renders a spec with image marks.
 */
export function installLoadedImage(): void {
  class LoadedImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin: string | null = null;
    complete = false;
    width = 8;
    height = 8;
    private url = '';

    get src(): string {
      return this.url;
    }

    set src(value: string) {
      this.url = value;
      this.complete = true;
      queueMicrotask(() => this.onload && this.onload());
    }
  }
  (globalThis as {Image?: unknown}).Image = LoadedImage;
}

/** An 8x8 red square, so an image mark needs nothing off the network. */
export const RED_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4' +
  'IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9InJlZCIvPjwvc3ZnPg==';

/** The same square in blue, for the tests that pair two pictures with a field. */
export const BLUE_IMAGE = RED_IMAGE.replace('cmVk', 'Ymx1ZQ');
