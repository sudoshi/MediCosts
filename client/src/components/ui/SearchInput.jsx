import { useState, useEffect, useRef } from 'react';
import styles from './SearchInput.module.css';

export default function SearchInput({ value, onChange, placeholder = 'Search...', debounceMs = 300 }) {
  const [local, setLocal] = useState(value || '');
  const timer = useRef(null);

  useEffect(() => { setLocal(value || ''); }, [value]);

  function handleChange(e) {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), debounceMs);
  }

  return (
    <div className={styles.wrapper}>
      <svg className={styles.icon} viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
      </svg>
      <input
        type="text"
        className={styles.input}
        value={local}
        onChange={handleChange}
        placeholder={placeholder}
      />
      {local && (
        <button className={styles.clear} onClick={() => { setLocal(''); onChange(''); }}>
          &times;
        </button>
      )}
    </div>
  );
}
