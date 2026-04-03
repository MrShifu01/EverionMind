import { createContext, useContext } from 'react';
export const EntriesContext = createContext(null);
export const useEntries = () => useContext(EntriesContext);
