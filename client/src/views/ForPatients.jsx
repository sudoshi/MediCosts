import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Panel from '../components/Panel.jsx';
import s from './ForPatients.module.css';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

export default function ForPatients() {
  const navigate = useNavigate();
  const [condition, setCondition] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [priority, setPriority] = useState('quality');

  function buildContext() {
    const parts = [];
    if (condition) {
      parts.push(`I need care for: ${condition}`);
    }
    if (state || city) {
      parts.push(`My location: ${city ? city + ', ' : ''}${state}`);
    }
    parts.push(`What matters most to me: ${priority === 'quality' ? 'quality of care' : priority === 'cost' ? 'lower cost' : 'closest location'}`);
    parts.push('\nPlease help me find the best healthcare provider for my needs. Consider quality ratings, patient satisfaction, safety records, and cost.');
    return parts.join('\n\n');
  }

  function handleTalkToAbby() {
    const context = buildContext();
    navigate('/abby', { state: { patientContext: context } });
  }

  const canSubmit = condition;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Know Before You Go</h1>
        <p className={s.subtitle}>Tell us about your needs and let Abby find the best care for you</p>
      </header>

      <div className={s.grid}>
        <Panel title="Medical Record Uploads">
          <div className={s.uploadZone}>
            <div className={s.uploadContent}>
              <span className={s.uploadText}>Uploads now require a signed HIPAA authorization / medical record release.</span>
              <span className={s.uploadHint}>Create a case, sign the release, then upload bills, EOBs, insurance cards, and medical documents.</span>
              <button className={s.caseButton} type="button" onClick={() => navigate('/cases')}>
                Open My Cases
              </button>
            </div>
          </div>
        </Panel>

        {/* Questionnaire */}
        <Panel title="Tell Us About Your Needs">
          <div className={s.form}>
            <div className={s.fieldGroup}>
              <label className={s.label}>What procedure or condition do you need care for?</label>
              <input
                className={s.input}
                placeholder="e.g., knee replacement, heart surgery, diabetes management..."
                value={condition}
                onChange={e => setCondition(e.target.value)}
              />
            </div>

            <div className={s.fieldRow}>
              <div className={s.fieldGroup}>
                <label className={s.label}>Your State</label>
                <select className={s.select} value={state} onChange={e => setState(e.target.value)}>
                  <option value="">Select state...</option>
                  {STATES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div className={s.fieldGroup}>
                <label className={s.label}>Your City</label>
                <input
                  className={s.input}
                  placeholder="e.g., Dallas"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                />
              </div>
            </div>

            <div className={s.fieldGroup}>
              <label className={s.label}>What matters most to you?</label>
              <div className={s.radioGroup}>
                {[
                  { value: 'quality', label: 'Best Quality', desc: 'Highest ratings & patient satisfaction' },
                  { value: 'cost', label: 'Lower Cost', desc: 'Most affordable care options' },
                  { value: 'distance', label: 'Closest', desc: 'Nearest providers to your location' },
                ].map(opt => (
                  <label key={opt.value} className={`${s.radioCard} ${priority === opt.value ? s.radioActive : ''}`}>
                    <input
                      type="radio"
                      name="priority"
                      value={opt.value}
                      checked={priority === opt.value}
                      onChange={e => setPriority(e.target.value)}
                      className={s.radioInput}
                    />
                    <span className={s.radioLabel}>{opt.label}</span>
                    <span className={s.radioDesc}>{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* CTA */}
      <div className={s.ctaSection}>
        <button
          className={s.ctaButton}
          disabled={!canSubmit}
          onClick={handleTalkToAbby}
        >
          Talk to Abby - Find My Best Care
        </button>
        <p className={s.ctaHint}>
          Abby will analyze your needs against quality ratings, patient satisfaction, safety records, and cost data
          for thousands of Medicare providers.
        </p>
      </div>
    </div>
  );
}
