import sys
from pypdf import PdfWriter
with PdfWriter() as writer:
    for filename in sys.argv[2:]:
        writer.append(filename)
    writer.add_metadata({'/Title':'Selected GST invoices'})
    writer.write(sys.argv[1])
