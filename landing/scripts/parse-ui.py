import xml.etree.ElementTree as ET
import sys

path = sys.argv[1] if len(sys.argv) > 1 else '.ui.xml'
root = ET.parse(path).getroot()
for n in root.iter('node'):
    if n.attrib.get('clickable') != 'true':
        continue
    label = n.attrib.get('text') or n.attrib.get('content-desc') or ''
    if not label:
        continue
    print(f"{label} | {n.attrib.get('bounds')}")
