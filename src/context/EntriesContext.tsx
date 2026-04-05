import { createContext, useContext } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EntriesContext = createContext<any>(null);
export const useEntries = () => useContext(EntriesContext);
