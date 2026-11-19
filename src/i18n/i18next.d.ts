import 'i18next';
import type { defaultNS, resources } from './index';

// Type-safe translation keys: t('nav.timeline') is checked at compile time.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['en'];
  }
}
