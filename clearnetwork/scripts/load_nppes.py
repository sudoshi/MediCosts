"""Load NPPES NPI Registry data into clearnetwork.canonical_providers.

Streams the 11 GB CSV line-by-line, batch-inserts via asyncpg COPY.
Skips deactivated and non-US providers.

Usage: python scripts/load_nppes.py
"""
import asyncio
import csv
import os
import re
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

NPPES_FILE = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "nppes"
    / "npidata_pfile_20050523-20260208.csv"
)
SCHEMA = "clearnetwork"
BATCH_SIZE = 5000

# Column indices (0-based) from NPPES CSV
COL_NPI = 0
COL_ENTITY_TYPE = 1
COL_ORG_NAME = 4
COL_LAST_NAME = 5
COL_FIRST_NAME = 6
COL_MIDDLE_NAME = 7
COL_CREDENTIAL = 10
COL_PRACTICE_ADDR = 28
COL_PRACTICE_CITY = 30
COL_PRACTICE_STATE = 31
COL_PRACTICE_ZIP = 32
COL_PRACTICE_COUNTRY = 33
COL_PRACTICE_PHONE = 34
COL_LAST_UPDATE = 37
COL_DEACTIVATION_DATE = 39
COL_TAXONOMY_1 = 47
# Taxonomy codes are at indices 47, 51, 55, 59, 63, 67, 71, 75, 79, 83, 87, 91, 95, 99, 103
TAXONOMY_INDICES = list(range(47, 104, 4))

# Common NUCC taxonomy code → readable specialty mapping (top ~200)
TAXONOMY_MAP = {
    "101Y00000X": "Counselor",
    "101YA0400X": "Addiction Counselor",
    "101YM0800X": "Mental Health Counselor",
    "101YP1600X": "Pastoral Counselor",
    "101YP2500X": "Professional Counselor",
    "101YS0200X": "School Counselor",
    "103T00000X": "Psychologist",
    "103TA0400X": "Addiction Psychologist",
    "103TA0700X": "Adult Development Psychologist",
    "103TC0700X": "Clinical Psychologist",
    "103TC2200X": "Clinical Child Psychologist",
    "104100000X": "Social Worker",
    "106H00000X": "Marriage & Family Therapist",
    "111N00000X": "Chiropractor",
    "122300000X": "Dentist",
    "1223G0001X": "General Practice Dentist",
    "1223P0221X": "Pediatric Dentist",
    "1223S0112X": "Oral Surgery Dentist",
    "133V00000X": "Dietitian",
    "136A00000X": "Dietetic Technician",
    "146N00000X": "Electrodiagnostic Medicine",
    "152W00000X": "Optometrist",
    "156FX1800X": "Optician",
    "163W00000X": "Registered Nurse",
    "163WA0400X": "Addiction Nurse",
    "163WG0600X": "Gerontology Nurse",
    "163WP0200X": "Pediatric Nurse",
    "163WP0808X": "Psychiatric Nurse",
    "163WX0002X": "Obstetric Nurse",
    "164W00000X": "Licensed Practical Nurse",
    "167G00000X": "Licensed Psychiatric Technician",
    "170100000X": "Medical Genetics",
    "171M00000X": "Case Manager",
    "174400000X": "Specialist",
    "175F00000X": "Naturopath",
    "175L00000X": "Homeopath",
    "176B00000X": "Midwife",
    "183500000X": "Pharmacist",
    "207K00000X": "Allergy & Immunology",
    "207L00000X": "Anesthesiology",
    "207N00000X": "Dermatology",
    "207P00000X": "Emergency Medicine",
    "207Q00000X": "Family Medicine",
    "207R00000X": "Internal Medicine",
    "207RC0000X": "Cardiovascular Disease",
    "207RE0101X": "Endocrinology",
    "207RG0100X": "Gastroenterology",
    "207RG0300X": "Geriatric Medicine",
    "207RH0000X": "Hematology",
    "207RH0003X": "Hematology & Oncology",
    "207RI0001X": "Clinical & Lab Immunology",
    "207RI0008X": "Hepatology",
    "207RI0011X": "Interventional Cardiology",
    "207RI0200X": "Infectious Disease",
    "207RM1200X": "Magnetic Resonance Imaging",
    "207RN0300X": "Nephrology",
    "207RP1001X": "Pulmonary Disease",
    "207RR0500X": "Rheumatology",
    "207RS0010X": "Sports Medicine (Internal Medicine)",
    "207RS0012X": "Sleep Medicine",
    "207RX0202X": "Medical Oncology",
    "207SC0300X": "Medical Toxicology",
    "207SG0201X": "Pediatric Emergency Medicine",
    "207SG0202X": "Sports Medicine (Emergency Medicine)",
    "207SM0001X": "Sports Medicine",
    "207T00000X": "Neurological Surgery",
    "207U00000X": "Nuclear Medicine",
    "207V00000X": "Obstetrics & Gynecology",
    "207VB0002X": "Bariatric Medicine",
    "207VC0200X": "Critical Care Medicine",
    "207VG0400X": "Gynecology",
    "207VM0101X": "Maternal & Fetal Medicine",
    "207VX0000X": "Obstetrics",
    "207VX0201X": "Gynecologic Oncology",
    "207W00000X": "Ophthalmology",
    "207X00000X": "Orthopaedic Surgery",
    "207XS0106X": "Hand Surgery (Orthopaedic)",
    "207XS0114X": "Adult Reconstructive Orthopaedic Surgery",
    "207XS0117X": "Orthopaedic Surgery of the Spine",
    "207Y00000X": "Otolaryngology",
    "207YS0123X": "Facial Plastic Surgery",
    "207ZB0001X": "Blood Banking",
    "207ZP0101X": "Anatomic Pathology",
    "207ZP0102X": "Clinical Pathology",
    "207ZP0104X": "Chemical Pathology",
    "207ZP0105X": "Clinical Pathology/Lab Medicine",
    "208000000X": "Pediatrics",
    "2080A0000X": "Pediatric Adolescent Medicine",
    "2080C0008X": "Pediatric Critical Care Medicine",
    "2080H0002X": "Pediatric Hospice Medicine",
    "2080I0007X": "Pediatric Infectious Diseases",
    "2080N0001X": "Neonatology",
    "2080P0006X": "Developmental-Behavioral Pediatrics",
    "2080P0008X": "Pediatric Neurodevelopmental Disabilities",
    "2080P0201X": "Pediatric Allergy/Immunology",
    "2080P0202X": "Pediatric Cardiology",
    "2080P0203X": "Pediatric Endocrinology",
    "2080P0204X": "Pediatric Gastroenterology",
    "2080P0205X": "Pediatric Hematology-Oncology",
    "2080P0206X": "Pediatric Nephrology",
    "2080P0207X": "Pediatric Pulmonology",
    "2080P0208X": "Pediatric Rheumatology",
    "208100000X": "Physical Medicine & Rehabilitation",
    "2081P0004X": "Spinal Cord Injury Medicine",
    "2081P0010X": "Pediatric Rehabilitation Medicine",
    "2081P2900X": "Pain Medicine",
    "208200000X": "Plastic Surgery",
    "208400000X": "Psychiatry",
    "2084A0401X": "Addiction Psychiatry",
    "2084B0002X": "Obesity Psychiatry",
    "2084P0005X": "Child & Adolescent Psychiatry",
    "2084P0800X": "Psychiatry",
    "2084P0802X": "Addiction Psychiatry",
    "2084P0804X": "Forensic Psychiatry",
    "2084P0805X": "Geriatric Psychiatry",
    "208600000X": "Surgery",
    "2086S0102X": "Surgical Critical Care",
    "2086S0105X": "Hand Surgery",
    "2086S0120X": "Pediatric Surgery",
    "2086S0122X": "Plastic & Reconstructive Surgery",
    "2086S0127X": "Trauma Surgery",
    "2086S0129X": "Vascular Surgery",
    "208800000X": "Urology",
    "208C00000X": "Colon & Rectal Surgery",
    "208D00000X": "General Practice",
    "208G00000X": "Thoracic Surgery",
    "208M00000X": "Hospitalist",
    "208VP0000X": "Pain Medicine",
    "208VP0014X": "Interventional Pain Medicine",
    "209800000X": "Legal Medicine",
    "211D00000X": "Assistant Podiatric",
    "213E00000X": "Podiatrist",
    "221700000X": "Art Therapist",
    "222Q00000X": "Developmental Therapist",
    "222Z00000X": "Orthotist",
    "224900000X": "Mastectomy Fitter",
    "224L00000X": "Pedorthist",
    "224P00000X": "Prosthetist",
    "224Z00000X": "Occupational Therapy Assistant",
    "225000000X": "Orthopedic Assistant",
    "225100000X": "Physical Therapist",
    "225200000X": "Physical Therapy Assistant",
    "225400000X": "Rehabilitation Practitioner",
    "225500000X": "Respiratory Therapist",
    "225600000X": "Dance Therapist",
    "225700000X": "Massage Therapist",
    "225800000X": "Recreation Therapist",
    "225A00000X": "Music Therapist",
    "225B00000X": "Pulmonary Function Technologist",
    "225C00000X": "Rehabilitation Counselor",
    "225CA0014X": "Assistive Technology Practitioner",
    "225X00000X": "Occupational Therapist",
    "226300000X": "Kinesiotherapist",
    "227800000X": "Certified Respiratory Therapist",
    "227900000X": "Registered Respiratory Therapist",
    "229N00000X": "Anaplastologist",
    "231H00000X": "Audiologist",
    "235500000X": "Speech-Language Pathologist",
    "235Z00000X": "Speech-Language Assistant",
    "237600000X": "Audiologist-Hearing Aid Fitter",
    "237700000X": "Hearing Instrument Specialist",
    "242T00000X": "Perfusionist",
    "243U00000X": "Radiology Practitioner Assistant",
    "246Q00000X": "Pathology Specialist Technologist",
    "246R00000X": "Radiologic Technologist",
    "246W00000X": "Cardiology Technician",
    "246X00000X": "Cardiovascular Technologist",
    "246Y00000X": "Health Information Specialist Technologist",
    "246Z00000X": "Other Medical Specialist Technologist",
    "247000000X": "Health Information Technician",
    "247100000X": "Radiologic Technician",
    "247200000X": "Other Technician",
    "251300000X": "Local Education Agency (LEA)",
    "251B00000X": "Case Management Agency",
    "251C00000X": "Day Training/Habilitation Specialist",
    "251E00000X": "Home Health Aide Agency",
    "251F00000X": "Home Infusion Agency",
    "251G00000X": "Hospice Care Agency",
    "251J00000X": "Nursing Care Agency",
    "251K00000X": "Public Health or Welfare Agency",
    "251S00000X": "Community/Behavioral Health Agency",
    "252Y00000X": "Early Intervention Provider Agency",
    "253J00000X": "Foster Care Agency",
    "253Z00000X": "In Home Supportive Care Agency",
    "261Q00000X": "Clinic/Center",
    "261QA0600X": "Adult Day Care Clinic",
    "261QA1903X": "Ambulatory Surgical Center",
    "261QB0400X": "Birthing Center",
    "261QC1500X": "Community Health Center",
    "261QC1800X": "Corporate Health Clinic",
    "261QD0000X": "Dental Clinic",
    "261QE0002X": "Emergency Care Clinic",
    "261QE0700X": "End-Stage Renal Disease Clinic",
    "261QF0050X": "Non-Residential OPIOID Treatment Facility",
    "261QF0400X": "Federally Qualified Health Center",
    "261QH0100X": "Health Service Clinic",
    "261QI0500X": "Infusion Therapy Clinic",
    "261QL0400X": "Lithotripsy Clinic",
    "261QM0801X": "Mental Health Clinic",
    "261QM1000X": "Migrant Health Clinic",
    "261QM1100X": "Military Clinic",
    "261QM1200X": "Magnetic Resonance Imaging Clinic",
    "261QM2500X": "Medical Specialty Clinic",
    "261QP0904X": "Federal Public Health Clinic",
    "261QP0905X": "State Public Health Clinic",
    "261QP2000X": "Physical Therapy Clinic",
    "261QP2300X": "Primary Care Clinic",
    "261QP2400X": "Prison Health Clinic",
    "261QR0200X": "Radiology Clinic",
    "261QR0206X": "Mammography Clinic",
    "261QR0400X": "Rehabilitation Clinic",
    "261QR0401X": "Comprehensive Outpatient Rehabilitation Facility",
    "261QR0405X": "Cardiac Rehabilitation Clinic",
    "261QR0800X": "Recovery Care Clinic",
    "261QR1100X": "Research Clinic",
    "261QR1300X": "Rural Health Clinic",
    "261QS0112X": "Oral & Maxillofacial Surgery Clinic",
    "261QS0132X": "Ophthalmologic Surgery Clinic",
    "261QS1000X": "Student Health Clinic",
    "261QS1200X": "Sleep Disorder Clinic",
    "261QU0200X": "Urgent Care Clinic",
    "261QV0200X": "VA Clinic",
    "261QX0100X": "Occupational Medicine Clinic",
    "273100000X": "Epilepsy Hospital Unit",
    "273R00000X": "Psychiatric Hospital Unit",
    "273Y00000X": "Rehabilitation Hospital Unit",
    "275N00000X": "Medicare Defined Swing Bed Unit",
    "276400000X": "Rehabilitation/Substance Use Disorder Unit",
    "281P00000X": "Chronic Disease Hospital",
    "281PC2000X": "Children's Chronic Disease Hospital",
    "282N00000X": "General Acute Care Hospital",
    "282NC0060X": "Critical Access Hospital",
    "282NC2000X": "Children's Hospital",
    "282NR1301X": "Rural Acute Care Hospital",
    "282NW0100X": "Women's Hospital",
    "283Q00000X": "Psychiatric Hospital",
    "283X00000X": "Rehabilitation Hospital",
    "283XC2000X": "Children's Rehabilitation Hospital",
    "284300000X": "Special Hospital",
    "291900000X": "Military Hospital",
    "291U00000X": "Clinical Medical Laboratory",
    "292200000X": "Dental Laboratory",
    "293D00000X": "Physiological Laboratory",
    "302F00000X": "Exclusive Provider Organization",
    "302R00000X": "Health Maintenance Organization",
    "305R00000X": "Preferred Provider Organization",
    "305S00000X": "Point of Service",
    "310400000X": "Assisted Living Facility",
    "310500000X": "Intermediate Care Facility",
    "311500000X": "Alzheimer Center",
    "311Z00000X": "Custodial Care Facility",
    "313M00000X": "Nursing Facility",
    "314000000X": "Skilled Nursing Facility",
    "315D00000X": "Hospice",
    "315P00000X": "Intermediate Care Facility/Mental Illness",
    "320600000X": "Intellectual Disabilities Intermediate Care Facility",
    "320800000X": "Community Based Residential Treatment Facility",
    "320900000X": "Community Based Residential Treatment - Mental Illness",
    "322D00000X": "Residential Treatment Facility",
    "323P00000X": "Psychiatric Residential Treatment Facility",
    "324500000X": "Substance Abuse Rehabilitation Facility",
    "331L00000X": "Blood Bank",
    "332000000X": "Military/U.S. Coast Guard Pharmacy",
    "332100000X": "Department of Veterans Affairs Pharmacy",
    "332800000X": "Indian Health Service/Tribal/Urban Pharmacy",
    "332900000X": "Non-Pharmacy Dispensing Site",
    "332B00000X": "Durable Medical Equipment",
    "332BP3500X": "Parenteral & Enteral Nutrition Supplier",
    "332G00000X": "Eye Bank",
    "332H00000X": "Eyewear Supplier",
    "332S00000X": "Hearing Aid Equipment Supplier",
    "332U00000X": "Home Delivered Meals Supplier",
    "333300000X": "Emergency Response System Supplier",
    "333600000X": "Pharmacy",
    "3336C0002X": "Clinic Pharmacy",
    "3336C0003X": "Community/Retail Pharmacy",
    "3336C0004X": "Compounding Pharmacy",
    "3336H0001X": "Home Infusion Therapy Pharmacy",
    "3336I0012X": "Institutional Pharmacy",
    "3336L0003X": "Long Term Care Pharmacy",
    "3336M0002X": "Mail Order Pharmacy",
    "3336M0003X": "Managed Care Organization Pharmacy",
    "3336N0007X": "Nuclear Pharmacy",
    "3336S0011X": "Specialty Pharmacy",
    "335E00000X": "Prosthetic/Orthotic Supplier",
    "335U00000X": "Organ Procurement Organization",
    "335V00000X": "Portable X-ray Supplier",
    "341600000X": "Ambulance",
    "341800000X": "Military/U.S. Coast Guard Transport",
    "343800000X": "Secured Medical Transport",
    "343900000X": "Non-emergency Medical Transport",
    "344600000X": "Taxi",
    "344800000X": "Air Carrier",
    "347B00000X": "Bus",
    "347C00000X": "Private Vehicle",
    "347D00000X": "Train",
    "347E00000X": "Transportation Broker",
    "363A00000X": "Physician Assistant",
    "363AM0700X": "Medical PA",
    "363AS0400X": "Surgical PA",
    "363L00000X": "Nurse Practitioner",
    "363LA2100X": "Acute Care NP",
    "363LA2200X": "Adult Health NP",
    "363LC0200X": "Critical Care Medicine NP",
    "363LC1500X": "Community Health NP",
    "363LF0000X": "Family NP",
    "363LG0600X": "Gerontology NP",
    "363LN0000X": "Neonatal NP",
    "363LN0005X": "Neonatal Critical Care NP",
    "363LP0200X": "Pediatric NP",
    "363LP0222X": "Pediatric Critical Care NP",
    "363LP0808X": "Psychiatric NP",
    "363LP1700X": "Perinatal NP",
    "363LP2300X": "Primary Care NP",
    "363LS0200X": "School NP",
    "363LW0102X": "Women's Health NP",
    "363LX0001X": "Obstetrics & Gynecology NP",
    "363LX0106X": "Occupational Health NP",
    "364S00000X": "Clinical Nurse Specialist",
    "367500000X": "Nurse Anesthetist (CRNA)",
    "367A00000X": "Advanced Practice Midwife",
    "367H00000X": "Anesthesiologist Assistant",
    "372500000X": "Chore Provider",
    "372600000X": "Adult Companion",
    "373H00000X": "Day Training/Habilitation Specialist",
    "374700000X": "Technician",
    "374K00000X": "Community Health Worker",
    "376G00000X": "Nursing Home Administrator",
    "376K00000X": "Nurse Aide",
    "385H00000X": "Respite Care",
    "390200000X": "Student Health",
    "405300000X": "Prevention Professional",
}

# Strip suffixes from org names
ORG_SUFFIXES_RE = re.compile(
    r"\s*,?\s*(LLC|INC|PA|PLLC|PC|CORP|LTD|LP|LLP|CO|CORPORATION|"
    r"INCORPORATED|LIMITED|COMPANY)\.?\s*$",
    re.IGNORECASE,
)


def canonicalize_name(entity_type, org_name, last_name, first_name, middle_name, credential):
    """Build canonical name from NPPES fields."""
    if entity_type == "2" and org_name:
        # Organization
        name = org_name.strip().upper()
        name = ORG_SUFFIXES_RE.sub("", name).strip()
        return name
    else:
        # Individual
        parts = []
        if last_name:
            parts.append(last_name.strip().upper())
        if first_name:
            parts.append(first_name.strip().upper())
        name = ", ".join(parts) if parts else None
        if name and credential and credential.strip():
            name += f" {credential.strip().upper()}"
        return name


def parse_date(date_str):
    """Parse MM/DD/YYYY date string."""
    if not date_str or not date_str.strip():
        return None
    try:
        return datetime.strptime(date_str.strip(), "%m/%d/%Y")
    except ValueError:
        return None


def get_taxonomy_codes(row):
    """Extract all non-empty taxonomy codes."""
    codes = []
    for idx in TAXONOMY_INDICES:
        if idx < len(row) and row[idx].strip():
            codes.append(row[idx].strip())
    return codes


def get_entity_type(code):
    """Map NPPES entity type code to our entity_type."""
    return "individual" if code == "1" else "facility"


async def main():
    if not NPPES_FILE.exists():
        print(f"ERROR: NPPES file not found at {NPPES_FILE}")
        sys.exit(1)

    print(f"Loading NPPES data from {NPPES_FILE}")
    print(f"File size: {NPPES_FILE.stat().st_size / 1e9:.1f} GB")

    conn = await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )

    # Clear existing data — use explicit transaction so it commits
    async with conn.transaction():
        await conn.execute(f"TRUNCATE {SCHEMA}.canonical_providers CASCADE")
    print("Truncated canonical_providers table")

    # Temporarily drop unique index for faster COPY, re-create after
    async with conn.transaction():
        await conn.execute(
            f"DROP INDEX IF EXISTS {SCHEMA}.ix_canonical_providers_npi"
        )
    print("Dropped NPI index for faster loading")

    columns = [
        "canonical_id", "npi", "name_canonical", "entity_type",
        "specialty_primary", "specialty_codes",
        "address_street", "address_city", "address_state", "address_zip",
        "phone", "last_updated",
    ]

    loaded = 0
    skipped = 0
    errors = 0
    batch = []
    start = time.time()

    with open(NPPES_FILE, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        _header = next(reader)  # skip header

        for row in reader:
            try:
                # Skip deactivated
                if len(row) > COL_DEACTIVATION_DATE and row[COL_DEACTIVATION_DATE].strip():
                    skipped += 1
                    continue

                # Skip non-US
                if (
                    len(row) > COL_PRACTICE_COUNTRY
                    and row[COL_PRACTICE_COUNTRY].strip()
                    and row[COL_PRACTICE_COUNTRY].strip() != "US"
                ):
                    skipped += 1
                    continue

                npi = row[COL_NPI].strip()
                if not npi or len(npi) != 10:
                    skipped += 1
                    continue

                entity_type = get_entity_type(row[COL_ENTITY_TYPE].strip())

                name = canonicalize_name(
                    row[COL_ENTITY_TYPE].strip(),
                    row[COL_ORG_NAME] if len(row) > COL_ORG_NAME else "",
                    row[COL_LAST_NAME] if len(row) > COL_LAST_NAME else "",
                    row[COL_FIRST_NAME] if len(row) > COL_FIRST_NAME else "",
                    row[COL_MIDDLE_NAME] if len(row) > COL_MIDDLE_NAME else "",
                    row[COL_CREDENTIAL] if len(row) > COL_CREDENTIAL else "",
                )

                taxonomy_codes = get_taxonomy_codes(row)
                primary_code = taxonomy_codes[0] if taxonomy_codes else None
                specialty = TAXONOMY_MAP.get(primary_code, primary_code) if primary_code else None

                state = row[COL_PRACTICE_STATE].strip()[:2] if len(row) > COL_PRACTICE_STATE else None

                zip_code = row[COL_PRACTICE_ZIP].strip()[:5] if len(row) > COL_PRACTICE_ZIP else None
                if zip_code and len(zip_code) < 5:
                    zip_code = zip_code.zfill(5)

                phone = row[COL_PRACTICE_PHONE].strip() if len(row) > COL_PRACTICE_PHONE else None
                if phone and len(phone) == 10:
                    phone = f"({phone[:3]}) {phone[3:6]}-{phone[6:]}"

                last_updated = parse_date(
                    row[COL_LAST_UPDATE] if len(row) > COL_LAST_UPDATE else ""
                )

                record = (
                    uuid.uuid4(),
                    npi,
                    name,
                    entity_type,
                    specialty,
                    taxonomy_codes if taxonomy_codes else None,
                    row[COL_PRACTICE_ADDR].strip() if len(row) > COL_PRACTICE_ADDR else None,
                    row[COL_PRACTICE_CITY].strip() if len(row) > COL_PRACTICE_CITY else None,
                    state,
                    zip_code,
                    phone,
                    last_updated,
                )
                batch.append(record)

                if len(batch) >= BATCH_SIZE:
                    try:
                        async with conn.transaction():
                            await conn.copy_records_to_table(
                                "canonical_providers",
                                records=batch,
                                columns=columns,
                                schema_name=SCHEMA,
                            )
                        loaded += len(batch)
                    except Exception as batch_err:
                        # Batch failed — try individual inserts to salvage good rows
                        if errors < 5:
                            print(f"\n  Batch error: {batch_err} — retrying individually")
                        salvaged = 0
                        for rec in batch:
                            try:
                                async with conn.transaction():
                                    await conn.execute(
                                        f"INSERT INTO {SCHEMA}.canonical_providers "
                                        f"({','.join(columns)}) VALUES "
                                        f"({','.join(f'${i+1}' for i in range(len(columns)))})",
                                        *rec,
                                    )
                                salvaged += 1
                            except Exception:
                                errors += 1
                        loaded += salvaged

                    elapsed = time.time() - start
                    rate = loaded / elapsed if elapsed > 0 else 0
                    print(
                        f"  Loaded {loaded:>10,} | Skipped {skipped:>8,} | "
                        f"Errors {errors:>5,} | {rate:,.0f} rows/sec",
                        end="\r",
                    )
                    sys.stdout.flush()
                    batch = []

            except Exception as e:
                errors += 1
                if errors <= 10:
                    print(f"\n  Error on row: {e}")

    # Flush remaining batch
    if batch:
        async with conn.transaction():
            await conn.copy_records_to_table(
                "canonical_providers",
                records=batch,
                columns=columns,
                schema_name=SCHEMA,
            )
        loaded += len(batch)

    # Re-create NPI unique index
    print(f"\n\nRecreating NPI unique index...")
    async with conn.transaction():
        await conn.execute(
            f"CREATE UNIQUE INDEX ix_canonical_providers_npi "
            f"ON {SCHEMA}.canonical_providers (npi)"
        )

    elapsed = time.time() - start
    print(f"\n\nDone in {elapsed:.0f}s ({elapsed / 60:.1f} min)")
    print(f"  Loaded:  {loaded:,}")
    print(f"  Skipped: {skipped:,}")
    print(f"  Errors:  {errors:,}")

    count = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.canonical_providers")
    print(f"\nVerification: {count:,} rows in canonical_providers")

    # Show sample
    sample = await conn.fetch(
        f"SELECT npi, name_canonical, entity_type, specialty_primary, address_state "
        f"FROM {SCHEMA}.canonical_providers LIMIT 5"
    )
    print("\nSample records:")
    for r in sample:
        print(f"  NPI {r['npi']}: {r['name_canonical']} ({r['entity_type']}) "
              f"- {r['specialty_primary']} [{r['address_state']}]")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
