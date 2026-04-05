import { createContext, useContext } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BrainContext = createContext<any>(null);
export const useBrain = () => useContext(BrainContext);
