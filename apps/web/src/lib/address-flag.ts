import { useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * A form that a link elsewhere can open by adding `?<name>=1` to the address
 * (the first steps of Phase 32 do this). Closing it takes the flag out of the
 * address, so going back or reloading does not open it again.
 */
export function useAddressFlag(name: string): [boolean, (open: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get(name) === '1');
  const change = (next: boolean) => {
    setOpen(next);
    if (!next && params.has(name)) {
      setParams(
        (current) => {
          const rest = new URLSearchParams(current);
          rest.delete(name);
          return rest;
        },
        { replace: true },
      );
    }
  };
  return [open, change];
}
