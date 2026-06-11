import shapefile
from collections import Counter

sf = shapefile.Reader("/tmp/vicmap-raw/gda2020_vicgrid/esrishape/customised_delivery/MELB_METRO_VAR1-4000/VMPROP/V_PARCEL_MP")
fields = [f[0] for f in sf.fields[1:]]
idx_lga = fields.index("PC_LGAC")
idx_stat = fields.index("PC_STAT")
idx_plan = fields.index("PC_PLANNO")
idx_lot = fields.index("PC_LOTNO")

lga_samples = Counter()
sample_records = {}

for i, rec in enumerate(sf.iterRecords()):
    if i >= 200000:
        break
    stat = rec[idx_stat]
    if stat != 'A':
        continue
    lga = str(rec[idx_lga]).strip()
    lga_samples[lga] += 1
    if lga not in sample_records:
        sample_records[lga] = rec

print("=== LGA codes and sample records ===")
for code, cnt in sorted(lga_samples.items(), key=lambda x: -x[1]):
    rec = sample_records[code]
    plan = str(rec[idx_plan])[:20] if idx_plan else "?"
    lot = str(rec[idx_lot])[:10] if idx_lot else "?"
    print(f"  LGA {code:>4s} | {cnt:>6,} parcels | Plan: {plan:20s} Lot: {lot:>10s}")
