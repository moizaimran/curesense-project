let _pending: string | null = null;

export const bodyMapStore = {
  set: (answer: string) => { _pending = answer; },
  take: (): string | null => { const v = _pending; _pending = null; return v; },
};
