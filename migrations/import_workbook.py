"""Generate a lossless private PostgreSQL import from the backed-up XLSX.

The generated SQL contains production data. Keep it outside Git and never print it.
"""
from pathlib import Path
import sys
from decimal import Decimal
from datetime import date, datetime, time
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from openpyxl import load_workbook
from openpyxl.utils.cell import get_column_letter
SPECS = {
    'Settings':'key', 'Members':'member_id', 'Sessions':'token',
    'MemberAddresses':'address_id', 'Products':'product_id',
    'Categories':'kategori_id', 'PickupLocations':'lokasi_id',
    'DeliverySlots':'slot_id', 'Holidays':'tanggal', 'Orders':'order_id',
    'OrderItems':None, 'ProductVariants':'variant_id',
    'ProductAddons':'addon_id', 'OrderItemAddons':'id',
    'PointHistory':'id', 'Reviews':'review_id', 'PromoCodes':'promo_id',
    'PromoUsage':'usage_id', 'MessageTemplates':'kode',
    'Campaigns':'campaign_id', 'Logs':None,
}
if len(sys.argv) != 3:
    raise SystemExit('usage: import_workbook.py PRIVATE_EXPORT.xlsx PRIVATE_OUTPUT.sql')
SOURCE = Path(sys.argv[1])
TARGET = Path(sys.argv[2])

def sql_ident(text):
    return '"' + str(text).replace('"', '""') + '"'

def sql_text(value):
    if value is None:
        value = ''
    elif isinstance(value, bool):
        value = 'TRUE' if value else 'FALSE'
    else:
        value = str(value)
    return "'" + value.replace("'", "''") + "'"

def raw_numeric_cells(archive, sheet_number):
    """Excel styles can turn a numeric value into a Python time/datetime."""
    root = ET.fromstring(archive.read(f'xl/worksheets/sheet{sheet_number}.xml'))
    namespace = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    raw = {}
    for node in root.findall('.//x:sheetData/x:row/x:c', namespace):
        if node.get('t', 'n') != 'n':
            continue
        item = node.find('x:v', namespace)
        if item is not None and item.text is not None:
            raw[node.get('r')] = item.text
    return raw

def normalized_text(value, header, raw):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    is_date = header.endswith('_at') or header in {'timestamp', 'tgl_antar', 'tanggal', 'used_date', 'last_seen_orders_at'}
    if is_date and isinstance(value, (datetime, date)):
        return value.strftime('%Y-%m-%d' if header in {'tgl_antar', 'tanggal', 'used_date'} else '%Y-%m-%d %H:%M:%S')
    if is_date and isinstance(value, time):
        return value.strftime('%H:%M:%S')
    if raw is not None:
        number = Decimal(raw)
        return format(number, 'f').rstrip('0').rstrip('.') if '.' in format(number, 'f') else format(number, 'f')
    return str(value)

wb = load_workbook(SOURCE, read_only=True, data_only=True)
if not set(SPECS).issubset(wb.sheetnames):
    raise SystemExit('required business sheet missing')
archive = ZipFile(SOURCE)
with TARGET.open('w', encoding='utf-8', newline='\n') as out:
    out.write("\\set ON_ERROR_STOP on\nBEGIN;\nCREATE SCHEMA IF NOT EXISTS samijaya;\n")
    out.write("CREATE TABLE IF NOT EXISTS samijaya.import_manifest (sheet_name text PRIMARY KEY, source_rows integer NOT NULL, imported_at timestamptz NOT NULL DEFAULT now());\n")
    for name, primary in SPECS.items():
        sheet = wb[name]
        raw = raw_numeric_cells(archive, wb.sheetnames.index(name) + 1)
        iterator = sheet.iter_rows(values_only=True)
        headers = [str(v).strip() if v is not None else '' for v in next(iterator)]
        headers = [h for h in headers if h]
        table = sql_ident(name)
        cols = ', '.join(f'{sql_ident(h)} text NOT NULL DEFAULT \'\'' for h in headers)
        out.write(f'CREATE TABLE samijaya.{table} (source_row integer PRIMARY KEY, {cols});\n')
        count = 0
        for source_row, values in enumerate(iterator, 2):
            if not any(v is not None and str(v).strip() for v in values):
                continue
            row = list(values[:len(headers)])
            row += [None] * (len(headers) - len(row))
            fields = ', '.join(sql_ident(h) for h in headers)
            literals = ', '.join(sql_text(normalized_text(v, headers[index], raw.get(f'{get_column_letter(index+1)}{source_row}')))
                                 for index, v in enumerate(row))
            out.write(f'INSERT INTO samijaya.{table} (source_row, {fields}) VALUES ({source_row}, {literals});\n')
            count += 1
        out.write(f'INSERT INTO samijaya.import_manifest (sheet_name, source_rows) VALUES ({sql_text(name)}, {count});\n')
        if primary and name != 'ProductAddons':
            out.write(f'CREATE UNIQUE INDEX {sql_ident(name + "_primary_uidx")} ON samijaya.{table} ({sql_ident(primary)});\n')
        if primary:
            out.write(f'CREATE INDEX {sql_ident(name + "_lookup_idx")} ON samijaya.{table} ({sql_ident(primary)});\n')
    out.write('COMMIT;\n')
wb.close()
archive.close()
print('private import SQL generated; bytes=', TARGET.stat().st_size)
