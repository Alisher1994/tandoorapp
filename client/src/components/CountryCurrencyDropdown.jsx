import React, { useEffect, useMemo, useRef, useState } from 'react';

function CountryCurrencyDropdown({
  language = 'ru',
  selectedOption = null,
  options = [],
  onChange,
  className = '',
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

  const handleSelect = (code) => {
    if (!isInteractive) return;
    if (typeof onChange === 'function') {
      onChange(code);
    }
    setIsOpen(false);
  };

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
              <span className="country-currency-code">{currentOption.currencyRu || currentOption.currencyUz}</span>
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
                  <span className="country-currency-code">{option.currencyRu || option.currencyUz}</span>
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
