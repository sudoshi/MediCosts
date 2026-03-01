import styles from './Tabs.module.css';

export default function Tabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className={styles.tabs}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
          onClick={() => onTabChange(tab.id)}
          style={{
            '--tab-color': tab.color || 'var(--accent)',
            '--tab-dim': tab.dim || 'var(--accent-dim)',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
