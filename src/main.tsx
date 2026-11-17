import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LocalStorageRepository } from './data/repository';
import { AccountLayer } from './features/account/FamilyAccount';
import { AccountProvider } from './state/account';
import { StoreProvider } from './state/store';
import './styles/global.css';

const repository = new LocalStorageRepository();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AccountProvider>
      <StoreProvider repository={repository}>
        <App />
        <AccountLayer />
      </StoreProvider>
    </AccountProvider>
  </StrictMode>,
);
