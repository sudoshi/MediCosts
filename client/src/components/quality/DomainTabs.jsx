import Tabs from '../ui/Tabs.jsx';
import { DOMAIN_COLORS } from '../../utils/qualityColors.js';

const DOMAINS = [
  { id: 'clinical',    label: 'Clinical',    color: DOMAIN_COLORS.clinical.main,    dim: DOMAIN_COLORS.clinical.dim },
  { id: 'safety',      label: 'Safety',      color: DOMAIN_COLORS.safety.main,      dim: DOMAIN_COLORS.safety.dim },
  { id: 'operational', label: 'Operations',   color: DOMAIN_COLORS.operational.main, dim: DOMAIN_COLORS.operational.dim },
  { id: 'quality',     label: 'Outcomes',     color: DOMAIN_COLORS.quality.main,     dim: DOMAIN_COLORS.quality.dim },
  { id: 'financial',   label: 'Financial',    color: DOMAIN_COLORS.financial.main,   dim: DOMAIN_COLORS.financial.dim },
];

export default function DomainTabs({ activeDomain, onDomainChange }) {
  return <Tabs tabs={DOMAINS} activeTab={activeDomain} onTabChange={onDomainChange} />;
}

export { DOMAINS };
