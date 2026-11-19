import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createMockApi } from '@/api/mock/mockApi';
import { App } from '@/app/App';
import '@/i18n';
import '@/styles/index.css';

const api = createMockApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
