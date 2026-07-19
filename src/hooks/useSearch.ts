import { useState } from 'react';

/**
 * The query/results/searching/note state machine shared by the app's lookup
 * panels (books, food, skincare). `run` trims the query, fetches, and on failure
 * (or no matches) sets a `note` instead of throwing. Result rendering and any
 * extra per-panel state (open row, shelves…) stay in the component.
 */
export function useSearch<T>(
  fetcher: (q: string) => Promise<T[]>,
  notes?: { empty?: string; error?: string },
) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');

  const run = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setNote('');
    try {
      const items = await fetcher(q);
      setResults(items);
      if (!items.length && notes?.empty) setNote(notes.empty);
    } catch {
      setNote(notes?.error ?? 'Search is unavailable right now — try again in a bit.');
      setResults([]);
    }
    setSearching(false);
  };

  const reset = () => {
    setResults([]);
    setQuery('');
    setNote('');
  };

  return { query, setQuery, results, setResults, searching, note, setNote, run, reset };
}
