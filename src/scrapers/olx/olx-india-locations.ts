/**
 * Major OLX India locations. The suffix is part of OLX's location identity;
 * using only a human-readable slug can resolve to the wrong place or to an
 * unfiltered page.
 */
export const OLX_INDIA_MAJOR_CITY_LOCATIONS = {
  delhi: 'delhi_g4058659',
  'new-delhi': 'delhi_g4058659',
  mumbai: 'mumbai_g4058997',
  'navi-mumbai': 'navi-mumbai_g4059005',
  bengaluru: 'bengaluru_g4058803',
  bangalore: 'bengaluru_g4058803',
  hyderabad: 'hyderabad_g4058526',
  chennai: 'chennai_g4059162',
  kolkata: 'kolkata_g4157275',
  pune: 'pune_g4059014',
  ahmedabad: 'ahmedabad_g4058677',
  jaipur: 'jaipur_g4059123',
  lucknow: 'lucknow_g4059306',
  chandigarh: 'chandigarh_g4058651',
  kochi: 'kochi_g4058873',
  nashik: 'nashik_g4059002',
  nagpur: 'nagpur_g4058998',
  surat: 'surat_g4058727',
  vadodara: 'vadodara_g4058732',
  rajkot: 'rajkot_g4058723',
  gandhinagar: 'gandhinagar_g4058698',
  indore: 'indore_g4058916',
  bhopal: 'bhopal_g4058901',
  jabalpur: 'jabalpur_g4058918',
  gwalior: 'gwalior_g4058913',
  patna: 'patna_g4058642',
  muzaffarpur: 'muzaffarpur_g4058640',
  gaya: 'gaya_g4058627',
  kanpur: 'kanpur_g4059295',
  varanasi: 'varanasi_g4059351',
  agra: 'agra_g4059243',
  meerut: 'meerut_g4059314',
  noida: 'noida_g4059326',
  ghaziabad: 'ghaziabad_g4059280',
  faridabad: 'faridabad_g4387779',
  gurgaon: 'gurgaon_g4058748',
  gurugram: 'gurgaon_g4058748',
  allahabad: 'allahabad_g4059246',
  prayagraj: 'allahabad_g4059246',
  bareilly: 'bareilly_g4059256',
  moradabad: 'moradabad_g4059318',
  aligarh: 'aligarh_g4059245',
  coimbatore: 'coimbatore_g4059164',
  madurai: 'madurai_g4059188',
  tiruchirappalli: 'tiruchirappalli_g4059220',
  trichy: 'tiruchirappalli_g4059220',
  salem: 'salem_g4059207',
  mysuru: 'mysuru_g4058841',
  mysore: 'mysuru_g4058841',
  mangaluru: 'mangaluru_g4058840',
  mangalore: 'mangaluru_g4058840',
  visakhapatnam: 'visakhapatnam_g4058593',
  vizag: 'visakhapatnam_g4058593',
  vijayawada: 'vijayawada_g4058591',
  guntur: 'guntur_g4058524',
  tirupati: 'tirupati_g4058588',
  thiruvananthapuram: 'thiruvananthapuram_g4058889',
  trivandrum: 'thiruvananthapuram_g4058889',
  kozhikode: 'kozhikode_g4058877',
  calicut: 'kozhikode_g4058877',
  bhubaneshwar: 'bhubaneshwar_g4059049',
  bhubaneswar: 'bhubaneshwar_g4059049',
  cuttack: 'cuttack_g4059052',
  guwahati: 'guwahati_g4058604',
  ranchi: 'ranchi_g4058797',
  jamshedpur: 'jamshedpur_g4058789',
  dhanbad: 'dhanbad_g4058786',
  raipur: 'raipur_g4059473',
  bilaspur: 'bilaspur_g4059465',
  bhilai: 'bhilai_g4059463',
  amritsar: 'amritsar_g4059069',
  ludhiana: 'ludhiana_g4059085',
  jalandhar: 'jalandhar_g4059081',
  dehradun: 'dehradun_g4059236',
  haridwar: 'haridwar_g4059238',
  roorkee: 'roorkee_g4059241',
  jodhpur: 'jodhpur_g4059126',
  udaipur: 'udaipur_g4059146',
  kota: 'kota_g4059129',
  ajmer: 'ajmer_g4059101',
  srinagar: 'srinagar_g4058774',
  jammu: 'jammu_g4058771',
  shimla: 'shimla_g4058768',
  panaji: 'panaji_g4058676',
  puducherry: 'puducherry_g4059067',
  pondicherry: 'puducherry_g4059067',
  gangtok: 'gangtok_g4059147',
  shillong: 'shillong_g4059037',
  imphal: 'imphal_g4059036',
  agartala: 'agartala_g4059235',
  siliguri: 'siliguri_g4221382',
} as const;

const INDIA_LOCATION_ALIASES: Readonly<Record<string, string>> = {
  ...OLX_INDIA_MAJOR_CITY_LOCATIONS,
  // State and territory aliases retained for the prototype's existing inputs.
  'delhi-nct': 'delhi_g2001152',
  maharashtra: 'maharashtra_g2001163',
  karnataka: 'karnataka_g2001159',
  telangana: 'telangana_g2007599',
  'tamil-nadu': 'tamil-nadu_g2001173',
  'west-bengal': 'west-bengal_g2001177',
  kerala: 'kerala_g2001160',
  gujarat: 'gujarat_g2001154',
  rajasthan: 'rajasthan_g2001171',
  punjab: 'punjab_g2001170',
  haryana: 'haryana_g2001155',
  'madhya-pradesh': 'madhya-pradesh_g2001162',
  bihar: 'bihar_g2001148',
  odisha: 'odisha_g2001168',
  chhattisgarh: 'chhattisgarh_g2001178',
  assam: 'assam_g2001147',
  uttarakhand: 'uttaranchal_g2001175',
  jharkhand: 'jharkhand_g2001158',
  goa: 'goa_g2001153',
  // Location IDs used by the separate prototype, corrected to current sitemap IDs.
  bangalore_g4058807: 'bengaluru_g4058803',
  hyderabad_g4058863: 'hyderabad_g4058526',
  pune_g4059015: 'pune_g4059014',
  ahmedabad_g4058789: 'ahmedabad_g4058677',
  lucknow_g4059318: 'lucknow_g4059306',
  chandigarh_g4058569: 'chandigarh_g4058651',
  kochi_g4058881: 'kochi_g4058873',
  kerala_r2001158: 'kerala_g2001160',
};

const INDIA_LOCATION_SLUG = /^[a-z0-9-]+_[gr]\d+$/i;

const normalizeLocationKey = (location: string): string =>
  location.trim().toLowerCase().replace(/\s+/g, '-');

/** Resolve a friendly major-city name or an explicit OLX location slug. */
export const resolveOlxIndiaLocation = (location: string): string => {
  const normalized = normalizeLocationKey(location);
  const alias = INDIA_LOCATION_ALIASES[normalized];

  if (alias) return alias;
  if (INDIA_LOCATION_SLUG.test(normalized)) return normalized;

  throw new Error(
    `Unknown OLX India location "${location}". Use a supported major city name or an ` +
      `OLX location slug such as "mumbai_g4058997".`
  );
};
