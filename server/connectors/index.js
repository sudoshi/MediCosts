/**
 * Connector factory — creates the appropriate connector instance by type.
 */
import FhirConnector from './FhirConnector.js';
import OmopConnector from './OmopConnector.js';
import CsvConnector from './CsvConnector.js';

const CONNECTOR_TYPES = {
  fhir: FhirConnector,
  omop: OmopConnector,
  csv: CsvConnector,
  // Commercial connectors reuse CsvConnector with vendor-specific mappings
  definitive: CsvConnector,
  vizient: CsvConnector,
  premier: CsvConnector,
};

export function createConnector(type, config, pool) {
  const ConnectorClass = CONNECTOR_TYPES[type];
  if (!ConnectorClass) throw new Error(`Unknown connector type: ${type}`);
  return new ConnectorClass(config, pool);
}

export const SUPPORTED_TYPES = Object.keys(CONNECTOR_TYPES);
