#!/usr/bin/env python3
"""Read-only BPC XLSB permit extractor.

Produces suburb-level aggregates from an official BPC/VBA raw workbook. It does
not connect to a database and never modifies the source workbook.
"""

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from pyxlsb import open_workbook


def clean(value):
    return " ".join(str(value or "").strip().upper().split())


def numeric(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def excel_date(value):
    if isinstance(value, (int, float)) and value > 0:
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).date()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        for pattern in ("%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(value.strip(), pattern).date()
            except ValueError:
                continue
    return None


def scalar(cell):
    return cell.v if hasattr(cell, "v") else cell


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--start", help="Inclusive permit issue date, YYYY-MM-DD")
    parser.add_argument("--end", help="Inclusive permit issue date, YYYY-MM-DD")
    parser.add_argument("--suburb")
    parser.add_argument("--postcode")
    parser.add_argument("--municipality")
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main():
    args = parse_args()
    start = datetime.strptime(args.start, "%Y-%m-%d").date() if args.start else None
    end = datetime.strptime(args.end, "%Y-%m-%d").date() if args.end else None
    wanted_suburb = clean(args.suburb)
    wanted_postcode = clean(args.postcode)
    wanted_municipality = clean(args.municipality)
    groups = defaultdict(lambda: {
        "permitCount": 0,
        "domesticResidentialPermitCount": 0,
        "dwellingActivityPermitCount": 0,
        "newDwellingPermitCount": 0,
        "demolitionPermitCount": 0,
        "newDwellings": 0.0,
        "demolishedDwellings": 0.0,
        "byMonth": Counter(),
    })
    exclusions = Counter()
    total_rows = 0

    with open_workbook(str(args.input)) as workbook:
        if "Sheet1" not in workbook.sheets:
            raise SystemExit("Expected Sheet1 in BPC workbook")
        with workbook.get_sheet("Sheet1") as sheet:
            iterator = sheet.rows()
            headers = [scalar(cell) for cell in next(iterator)][:36]
            index = {name: position for position, name in enumerate(headers)}
            required = {
                "permit_date", "site_town_suburb__c", "site_postcode__c",
                "Municipal Full Name", "Number_of_New_Dwellings__c",
                "Number_of_Dwellings_Demolished__c", "BASIS_Building_Use",
            }
            missing = sorted(required - index.keys())
            if missing:
                raise SystemExit(f"Missing required BPC columns: {', '.join(missing)}")
            for raw in iterator:
                total_rows += 1
                values = [scalar(cell) for cell in raw][:len(headers)]
                values += [None] * (len(headers) - len(values))
                issued = excel_date(values[index["permit_date"]])
                suburb = clean(values[index["site_town_suburb__c"]])
                postcode = clean(values[index["site_postcode__c"]]).removesuffix(".0")
                municipality = clean(values[index["Municipal Full Name"]])
                if not issued:
                    exclusions["missing_or_invalid_issue_date"] += 1
                    continue
                if start and issued < start:
                    exclusions["before_period"] += 1
                    continue
                if end and issued > end:
                    exclusions["after_period"] += 1
                    continue
                if wanted_suburb and suburb != wanted_suburb:
                    exclusions["other_suburb"] += 1
                    continue
                if wanted_postcode and postcode != wanted_postcode:
                    exclusions["other_postcode"] += 1
                    continue
                if wanted_municipality and wanted_municipality not in municipality:
                    exclusions["other_municipality"] += 1
                    continue
                if not suburb or not postcode or not municipality:
                    exclusions["missing_geography"] += 1
                    continue
                key = (suburb, postcode, municipality)
                group = groups[key]
                group["permitCount"] += 1
                group["byMonth"][issued.strftime("%Y-%m")] += 1
                building_use = clean(values[index["BASIS_Building_Use"]])
                residential = building_use in {"DOMESTIC", "RESIDENTIAL"}
                if residential:
                    group["domesticResidentialPermitCount"] += 1
                new = max(0, numeric(values[index["Number_of_New_Dwellings__c"]]))
                demolished = max(0, numeric(values[index["Number_of_Dwellings_Demolished__c"]]))
                if new > 0 or demolished > 0:
                    group["dwellingActivityPermitCount"] += 1
                if new > 0:
                    group["newDwellingPermitCount"] += 1
                if demolished > 0:
                    group["demolitionPermitCount"] += 1
                group["newDwellings"] += new
                group["demolishedDwellings"] += demolished

    suburbs = []
    for (suburb, postcode, municipality), group in sorted(groups.items()):
        suburbs.append({
            "suburb": suburb,
            "postcode": postcode,
            "municipality": municipality,
            "permitCount": group["permitCount"],
            "domesticResidentialPermitCount": group["domesticResidentialPermitCount"],
            "dwellingActivityPermitCount": group["dwellingActivityPermitCount"],
            "newDwellingPermitCount": group["newDwellingPermitCount"],
            "demolitionPermitCount": group["demolitionPermitCount"],
            "newDwellings": int(group["newDwellings"]),
            "demolishedDwellings": int(group["demolishedDwellings"]),
            "netAdditionalDwellings": int(group["newDwellings"] - group["demolishedDwellings"]),
            "byMonth": dict(sorted(group["byMonth"].items())),
        })
    result = {
        "schemaVersion": "bpc-building-permits-v1",
        "source": {
            "publisher": "Building and Plumbing Commission Victoria",
            "fileName": args.input.name,
            "sha256": sha256(args.input),
            "retrievedLocally": True,
        },
        "filters": {
            "periodStart": args.start,
            "periodEnd": args.end,
            "suburb": wanted_suburb or None,
            "postcode": wanted_postcode or None,
            "municipalityContains": wanted_municipality or None,
        },
        "quality": {
            "sourceRows": total_rows,
            "includedGeographies": len(suburbs),
            "excludedRows": dict(exclusions),
            "interpretation": "Permits issued; not commencements or completions",
        },
        "suburbs": suburbs,
    }
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")


if __name__ == "__main__":
    main()
