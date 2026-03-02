import { useState, useRef } from 'react';
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
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef(null);

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setExtracting(true);

    try {
      if (file.type === 'application/pdf') {
        // Dynamic import of pdfjs-dist for PDF extraction
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ') + '\n\n';
        }
        setFileText(text.trim());
      } else {
        // Plain text files
        const text = await file.text();
        setFileText(text.trim());
      }
    } catch (err) {
      setFileText(`[Could not extract text from ${file.name}. Please paste your medical information below.]`);
    }
    setExtracting(false);
  }

  function buildContext() {
    const parts = [];
    if (fileText) {
      parts.push(`Here is information from my medical records:\n${fileText.slice(0, 3000)}`);
    }
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

  const canSubmit = condition || fileText;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Know Before You Go</h1>
        <p className={s.subtitle}>Tell us about your needs and let Abby find the best care for you</p>
      </header>

      <div className={s.grid}>
        {/* Upload Section */}
        <Panel title="Upload Medical Records (Optional)">
          <div className={s.uploadZone} onClick={() => fileRef.current?.click()}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt"
              className={s.fileInput}
              onChange={handleFileUpload}
            />
            {extracting ? (
              <div className={s.uploadContent}>
                <span className={s.uploadIcon}>⏳</span>
                <span className={s.uploadText}>Extracting text...</span>
              </div>
            ) : fileName ? (
              <div className={s.uploadContent}>
                <span className={s.uploadIcon}>✓</span>
                <span className={s.uploadText}>{fileName}</span>
                <span className={s.uploadHint}>Click to change file</span>
              </div>
            ) : (
              <div className={s.uploadContent}>
                <span className={s.uploadIcon}>📄</span>
                <span className={s.uploadText}>Drop a PDF or click to upload</span>
                <span className={s.uploadHint}>Your records stay on your device — nothing is stored</span>
              </div>
            )}
          </div>
          {fileText && (
            <div className={s.extractedPreview}>
              <span className={s.previewLabel}>Extracted Text Preview</span>
              <textarea
                className={s.previewText}
                value={fileText}
                onChange={e => setFileText(e.target.value)}
                rows={6}
              />
            </div>
          )}
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
          Talk to Abby — Find My Best Care →
        </button>
        <p className={s.ctaHint}>
          Abby will analyze your needs against quality ratings, patient satisfaction, safety records, and cost data
          for thousands of Medicare providers.
        </p>
      </div>
    </div>
  );
}
