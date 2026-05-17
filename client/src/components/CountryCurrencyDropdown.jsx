import React, { useEffect, useMemo, useRef, useState } from 'react';

function CountryCurrencyDropdown({
  language = 'ru',
  selectedOption = null,
  options = [],
  onChange,
  className = '',
  layout = 'dropdown',
  readOnly = false,
  disabled = false
}) {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);
  const currentOption = selectedOption || safeOptions[0] || null;
  const isInteractive = !readOnly && !disabled && typeof onChange === 'function';

  useEffect(() => {
    if (!isOpen || !isInteractive) return undefined;

    const handleDocumentClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isInteractive]);

  const getCountryName = (option) => (
    language === 'uz'
      ? (option?.nameUz || option?.nameRu || '')
      : (option?.nameRu || option?.nameUz || '')
  );

  const getCurrencyName = (option) => (
    language === 'uz'
      ? (option?.currencyUz || option?.currencyRu || '')
      : (option?.currencyRu || option?.currencyUz || '')
  );

  const resolveCurrencyCode = (option) => {
    const code = String(option?.code || '').trim().toLowerCase();
    const map = {
      uz: 'UZS',
      kz: 'KZT',
      tm: 'TMT',
      tj: 'TJS',
      kg: 'KGS',
      af: 'AFN',
      ru: 'RUB',
      us: 'USD'
    };
    return map[code] || code.toUpperCase();
  };

  const handleSelect = (code) => {
    if (!isInteractive) return;
    if (typeof onChange === 'function') {
      onChange(code);
    }
    setIsOpen(false);
  };

  if (layout === 'cards') {
    return (
      <div ref={rootRef} className={`country-currency-cards ${className}`.trim()}>
        {safeOptions.map((option) => {
          const isActive = currentOption?.code === option.code;
          return (
            <button
              key={option.code}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`country-currency-card ${isActive ? 'is-active' : ''} ${!isInteractive ? 'is-disabled' : ''}`}
              onClick={() => handleSelect(option.code)}
              disabled={!isInteractive}
            >
              <img src={option.flag} alt={option.code.toUpperCase()} className="country-currency-flag" />
              <span className="country-currency-meta">
                <span className="country-currency-country">{getCountryName(option)}</span>
                <span className="country-currency-code">
                  {getCurrencyName(option)} ({resolveCurrencyCode(option)})
                </span>
              </span>
              {isActive && <span className="country-currency-check">✓</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`country-currency-dropdown ${className}`.trim()}>
      <button
        type="button"
        className={`country-currency-trigger ${isOpen ? 'is-open' : ''} ${readOnly ? 'is-readonly' : ''} ${disabled ? 'is-disabled' : ''}`}
        onClick={() => {
          if (!isInteractive) return;
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isInteractive ? isOpen : false}
        aria-haspopup="listbox"
        aria-disabled={!isInteractive}
        disabled={disabled}
      >
        {currentOption ? (
          <>
            <img src={currentOption.flag} alt={currentOption.code.toUpperCase()} className="country-currency-flag" />
            <span className="country-currency-meta">
              <span className="country-currency-country">{getCountryName(currentOption)}</span>
              <span className="country-currency-code">
                {getCurrencyName(currentOption)} ({resolveCurrencyCode(currentOption)})
              </span>
            </span>
          </>
        ) : (
          <span className="country-currency-meta">
            <span className="country-currency-country">-</span>
          </span>
        )}
        {isInteractive && (
          <span className={`country-currency-chevron ${isOpen ? 'is-open' : ''}`} aria-hidden="true">▾</span>
        )}
      </button>

      {isInteractive && isOpen && (
        <div className="country-currency-menu" role="listbox">
          {safeOptions.map((option) => {
            const isActive = currentOption?.code === option.code;
            return (
              <button
                key={option.code}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`country-currency-item ${isActive ? 'is-active' : ''}`}
                onClick={() => handleSelect(option.code)}
              >
                <img src={option.flag} alt={option.code.toUpperCase()} className="country-currency-flag" />
                <span className="country-currency-meta">
                  <span className="country-currency-country">{getCountryName(option)}</span>
                  <span className="country-currency-code">
                    {getCurrencyName(option)} ({resolveCurrencyCode(option)})
                  </span>
                </span>
                {isActive && <span className="country-currency-check">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CountryCurrencyDropdown;
