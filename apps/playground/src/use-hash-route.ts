import {useCallback, useSyncExternalStore} from 'react';

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

/** `#/violin` -> `violin`. The leading slash is optional so a hand-typed `#violin` still works. */
const readRoute = (): string => decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));

/**
 * The location hash as a piece of readable state, so the URL -- not a
 * component -- owns what the page is showing. Back/forward and pasted links
 * therefore work for free.
 *
 * `setRoute(next, true)` replaces the current history entry instead of pushing
 * one, which is what normalizing an absent or bogus hash wants: it should not
 * cost the user a press of the back button.
 */
export function useHashRoute(): [string, (next: string, replace?: boolean) => void] {
  const route = useSyncExternalStore(subscribe, readRoute, () => '');

  const setRoute = useCallback((next: string, replace = false) => {
    const hash = `#/${encodeURIComponent(next)}`;
    if (hash === window.location.hash) {
      return;
    }
    if (replace) {
      // replaceState deliberately fires no hashchange, so nothing would tell
      // the store about a change we made ourselves. Announce it.
      window.history.replaceState(null, '', hash);
      window.dispatchEvent(new Event('hashchange'));
    } else {
      window.location.hash = hash;
    }
  }, []);

  return [route, setRoute];
}
