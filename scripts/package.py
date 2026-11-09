"""Create a portable source/build archive without any real business data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import os

root = Path(__file__).resolve().parent.parent
destination = root / 'deliverables' / 'BillingWorkspace.zip'
temporary = destination.with_suffix('.next.zip')
destination.parent.mkdir(exist_ok=True)
directories = ['server','src','scripts','tests','dist','node_modules']
files = []
for name in directories:
    files += [p for p in (root/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
files += [p for p in root.iterdir() if p.is_file() and (p.suffix in ['.md','.json','.html'] or p.name=='.gitignore')]
with ZipFile(temporary,'w',ZIP_DEFLATED) as archive:
    for file in files:archive.write(file,file.relative_to(root).as_posix())
os.replace(temporary,destination)
print(f'{destination}: {destination.stat().st_size} bytes; {len(files)} files; business data excluded')
