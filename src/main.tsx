import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './components/ThemeProvider.tsx';
import { SearchProvider } from './components/SearchContext.tsx';
import { LayoutProvider } from './components/LayoutContext.tsx';
import { NavigationProvider } from './components/NavigationContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LayoutProvider>
        <SearchProvider>
          <NavigationProvider>
            <App />
          </NavigationProvider>
        </SearchProvider>
      </LayoutProvider>
    </ThemeProvider>
  </StrictMode>,
);
