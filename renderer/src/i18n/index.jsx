import { createContext, useContext, useState } from 'react';
import en from './en';
import zh from './zh';

const langs = { en, zh };
const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [lang, setLang] = useState('en');
  const t = (key) => {
    const keys = key.split('.');
    let val = langs[lang];
    for (const k of keys) {
      if (val && typeof val === 'object') val = val[k];
    }
    return val ?? key;
  };
  return (
    <I18nContext.Provider value={{ t, lang, setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
