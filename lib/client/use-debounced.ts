'use client';

import { useEffect, useState } from 'react';

/** The value, once it has stopped changing for `ms` (search boxes: 250 ms, plan §4 item 10). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
