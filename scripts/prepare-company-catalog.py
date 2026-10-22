"""Read the supplied XLSX without modifying it; export sale fields only (no costs/margins)."""
import argparse
import hashlib
import json
import posixpath
import unicodedata
import re
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
records, duplicate_rows = {}, []
with zipfile.ZipFile(args.source) as book:
    shared = []
    if 'xl/sharedStrings.xml' in book.namelist():
        shared = [''.join(s.itertext()) for s in ET.fromstring(book.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    links = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))}
    for sheet in ET.fromstring(book.read('xl/workbook.xml')).findall('m:sheets/m:sheet', ns):
        name = sheet.get('name')
        if name not in ('PRODUCTO AGRICOLA', 'EQUIPOS'):
            raise ValueError('Unreviewed sheet: ' + name)
        target = links[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        path = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
        for row in ET.fromstring(book.read(path)).findall('m:sheetData/m:row', ns):
            number = int(row.get('r'))
            if number < 3:
                continue
            values = {}
            for cell in row.findall('m:c', ns):
                column = re.sub(r'\d', '', cell.get('r'))
                # Intentionally exclude cost and margin columns from all retained output.
                allowed = 'ABCDEFGI' if name == 'PRODUCTO AGRICOLA' else 'ABCDF'
                if column not in allowed:
                    continue
                value = cell.find('m:v', ns)
                text = value.text if value is not None else ''
                if cell.get('t') == 's':
                    text = shared[int(text)]
                elif cell.get('t') == 'inlineStr':
                    text = ''.join(cell.find('m:is', ns).itertext())
                if cell.find('m:f', ns) is not None and column in ('I', 'F'):
                    raise ValueError('Formula sale price needs separate verification: ' + cell.get('r'))
                values[column] = (text or '').strip()
            agricultural = name == 'PRODUCTO AGRICOLA'
            sku, title, price = [values.get(c, '') for c in ('BCI' if agricultural else 'CDF')]
            if not sku and not title:
                continue
            if not sku or not title or not price or Decimal(price) <= 0:
                raise ValueError(f'Incomplete source record: {name} row {number}')
            brand, category = values['A' if agricultural else 'B'], values['G' if agricultural else 'A']
            amount = Decimal(price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            normalize = lambda text: re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()).strip('-')
            item = {'sku': sku, 'name': title, 'brand': brand, 'category': category,
                    'kind': 'agricultural' if agricultural else 'equipment',
                    'slug': normalize(brand + ' ' + sku), 'model': None if agricultural else sku,
                    'source_public_price': price, 'regular_price': str(amount), 'currency': 'GTQ',
                    'requires_rounding': Decimal(price) != amount, 'specs': []}
            if agricultural:
                for label, column in [('Presentación de caja', 'D'), ('Familia de producto', 'F')]:
                    if values.get(column):
                        item['specs'].append({'label': label, 'value': values[column]})
                # E mixes weight and volume and has inconsistent values; never infer shipping kg.
            if sku in records:
                original = {k: v for k, v in records[sku].items() if k != 'source_rows'}
                if original != item:
                    raise ValueError('Conflicting duplicate SKU: ' + sku)
                duplicate_rows.append({'sku': sku, 'sheet': name, 'row': number})
                records[sku]['source_rows'].append({'sheet': name, 'row': number})
            else:
                records[sku] = {**item, 'source_rows': [{'sheet': name, 'row': number}]}
result = {'source_filename': args.source.name, 'source_sha256': hashlib.sha256(args.source.read_bytes()).hexdigest(),
          'currency': 'GTQ', 'tax_included': True, 'rounding_rule': 'ROUND_HALF_UP to 0.01; approved for DEV on 2026-10-22',
          'duplicates_merged': duplicate_rows, 'products': list(records.values())}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'products': len(records), 'equipment': sum(r['kind'] == 'equipment' for r in records.values()),
                  'agricultural': sum(r['kind'] == 'agricultural' for r in records.values()), 'duplicates_merged': len(duplicate_rows)}))
