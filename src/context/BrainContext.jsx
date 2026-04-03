import { createContext, useContext } from 'react';
export const BrainContext = createContext(null);
export const useBrain = () => useContext(BrainContext);
