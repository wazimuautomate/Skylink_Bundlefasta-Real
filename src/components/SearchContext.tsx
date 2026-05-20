import { createContext, useContext, useState, ReactNode } from 'react';

interface SearchContextType {
  globalSearch: string;
  setGlobalSearch: (term: string) => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [globalSearch, setGlobalSearch] = useState('');
  return (
    <SearchContext.Provider value={{ globalSearch, setGlobalSearch }}>
      {children}
    </SearchContext.Provider>
  );
}

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) throw new Error('useSearch must be used within SearchProvider');
  return context;
};
