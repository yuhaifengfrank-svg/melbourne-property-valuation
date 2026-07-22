#!/usr/bin/env python3
"""Read-only collector for the public City of Monash ePathway register."""

import argparse
import json
import re
import time
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener

from lxml import html


BASE = "https://epathway.monash.vic.gov.au/ePathway/ePTHPROD/Web/GeneralEnquiry/"
REGISTER = BASE + "EnquiryLists.aspx"


def hidden_fields(document):
    return {
        element.get("name"): element.get("value", "")
        for element in document.xpath('//input[@type="hidden"][@name]')
    }


def post(opener, url, fields):
    request = Request(url, data=urlencode(fields).encode("utf-8"))
    return opener.open(request, timeout=45).read()


def exact_geography(location, suburb, postcode):
    pattern = rf"\b{re.escape(suburb)}\s+VIC\s+{re.escape(postcode)}$"
    return bool(re.search(pattern, location, re.IGNORECASE))


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True, help="DD/MM/YYYY")
    parser.add_argument("--end", required=True, help="DD/MM/YYYY")
    parser.add_argument("--suburb")
    parser.add_argument("--postcode")
    parser.add_argument("--all", action="store_true", help="Collect all register rows for local offline partitioning")
    parser.add_argument("--delay", type=float, default=0.5)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.all and (not args.suburb or not args.postcode):
        raise SystemExit("--suburb and --postcode are required unless --all is used")
    opener = build_opener(HTTPCookieProcessor(CookieJar()))
    lists_document = html.fromstring(opener.open(REGISTER, timeout=45).read())
    fields = hidden_fields(lists_document)
    fields["mDataGrid:Column0:Property"] = "ctl00$MainBodyContent$mDataList$ctl03$mDataGrid$ctl04$ctl00"
    fields["ctl00$MainBodyContent$mContinueButton"] = "Next"
    search_document = html.fromstring(post(opener, REGISTER, fields))
    fields = hidden_fields(search_document)
    prefix = "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl04$"
    fields[prefix + "mFromDatePicker$dateTextBox"] = args.start
    fields[prefix + "mToDatePicker$dateTextBox"] = args.end
    fields["ctl00$MainBodyContent$mGeneralEnquirySearchControl$mSearchButton"] = "Search"
    first_page = post(opener, BASE + "EnquirySearch.aspx?EnquiryListId=56", fields)
    page_numbers = [int(value) for value in re.findall(rb"PageNumber=(\d+)", first_page)]
    page_count = max(page_numbers, default=1)
    records = []
    source_rows = 0
    schema = ["applicationNumber", "lodgedDate", "applicationType", "location", "description", "status", "currentDecision"]
    for page_number in range(1, page_count + 1):
        payload = first_page if page_number == 1 else opener.open(
            BASE + f"EnquirySummaryView.aspx?PageNumber={page_number}", timeout=45
        ).read()
        document = html.fromstring(payload)
        tables = document.xpath('//table[@id="gridResults"]')
        if len(tables) != 1:
            raise SystemExit(f"Expected one gridResults table on page {page_number}")
        for table_row in tables[0].xpath('.//tr[position()>1]'):
            cells = [" ".join(cell.text_content().split()) for cell in table_row.xpath("./td")]
            if len(cells) < 7:
                continue
            source_rows += 1
            if args.all or exact_geography(cells[3], args.suburb, args.postcode):
                record = dict(zip(schema, cells[:7]))
                if not args.all:
                    record["suburb"] = args.suburb.upper()
                    record["postcode"] = args.postcode
                records.append(record)
        if page_number < page_count and args.delay > 0:
            time.sleep(args.delay)
    result = {
        "schemaVersion": "monash-epathway-register-v1",
        "source": {
            "publisher": "City of Monash",
            "url": REGISTER,
            "retrievedAt": datetime.now(timezone.utc).isoformat(),
        },
        "filters": {
            "lodgedStart": args.start,
            "lodgedEnd": args.end,
            "suburb": args.suburb.upper() if args.suburb else None,
            "postcode": args.postcode,
        },
        "quality": {
            "pageCount": page_count,
            "sourceRows": source_rows,
            "exactGeographyRows": len(records),
            "recordLevelReuse": "Internal validation only until council reuse terms are confirmed",
        },
        "records": records,
    }
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
