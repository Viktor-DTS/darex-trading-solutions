import React, { useState, useRef, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import './MaterialNameAutocomplete.css';

export default function MaterialNameAutocomplete({
  name,
  value,
  onChange,
  onValueChange,
  placeholder,
  disabled = false,
  className = '',
}) {
  const [hints, setHints] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);
  const wrapperRef = useRef(null);

  const fetchHints = useCallback((query) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = String(query || '').trim();
    if (q.length < 2) {
      setHints([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(
          `${API_BASE_URL}/service/material-hints?q=${encodeURIComponent(q)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error('material hints fetch failed');
        const data = await res.json();
        if (requestId !== requestIdRef.current) return;
        const list = Array.isArray(data) ? data : [];
        setHints(list);
        setOpen(list.length > 0);
      } catch (e) {
        console.error(e);
        if (requestId === requestIdRef.current) {
          setHints([]);
          setOpen(false);
        }
      }
    }, 350);
  }, []);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const emitValue = (nextValue) => {
    if (onValueChange) {
      onValueChange(nextValue);
    } else if (onChange) {
      onChange({ target: { name, value: nextValue } });
    }
  };

  const handleInputChange = (e) => {
    emitValue(e.target.value);
    fetchHints(e.target.value);
  };

  const handleFocus = () => {
    if (String(value || '').trim().length >= 2) {
      fetchHints(value);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const pickHint = (hint) => {
    emitValue(hint.label);
    setHints([]);
    setOpen(false);
  };

  const badgeClass = (qty) =>
    qty > 0 ? 'material-hint-badge material-hint-badge--ok' : 'material-hint-badge material-hint-badge--zero';

  return (
    <div className={`material-autocomplete-wrapper ${className}`.trim()} ref={wrapperRef}>
      <input
        type="text"
        name={name}
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {open && hints.length > 0 && (
        <ul className="material-hints-list" role="listbox">
          {hints.map((h) => (
            <li key={`${String(h.id || '')}-${h.label}`}>
              <button type="button" className="material-hint-item" onClick={() => pickHint(h)}>
                <span className="material-hint-row">
                  <span className="material-hint-label">{h.label}</span>
                  <span className={badgeClass(h.regionQty)}>
                    {h.regionLabel}: {h.regionQty}
                  </span>
                </span>
                {h.subtitle ? <span className="material-hint-sub">{h.subtitle}</span> : null}
                {h.otherRegions?.length > 0 ? (
                  <span className="material-hint-other">
                    {h.otherRegions.map((r) => `${r.region}: ${r.quantity}`).join(' · ')}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
