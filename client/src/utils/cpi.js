// CPI-U Medical Care index (BLS Series CUUR0000SAM)
// Used to convert nominal dollars to constant 2023 dollars
const CPI_MEDICAL = {
  2013: 425.1, 2014: 435.3, 2015: 446.8, 2016: 463.7,
  2017: 471.4, 2018: 479.5, 2019: 494.4, 2020: 506.8,
  2021: 519.2, 2022: 549.8, 2023: 566.5,
};

export function adjustForInflation(value, fromYear, toYear = 2023) {
  const from = CPI_MEDICAL[fromYear];
  const to = CPI_MEDICAL[toYear];
  if (!from || !to || value == null) return value;
  return value * (to / from);
}

export default CPI_MEDICAL;
