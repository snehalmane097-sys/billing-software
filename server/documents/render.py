"""Reusable print-only business document layout. All amounts arrive preformatted.

No billing calculations belong in this module. ReportLab handles paragraph wrapping,
table continuation and page breaks; images are embedded without changing aspect ratio.
"""
import base64
import io
import importlib.util
import json
import os
import re
import sys
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable

IVORY = colors.HexColor('#F5F0E8')
SAND = colors.HexColor('#D5C4AE')
BROWN = colors.HexColor('#6B4A2E')
MOCHA = colors.HexColor('#3A2418')
INK = colors.HexColor('#1A120E')
MUTED = colors.HexColor('#80634B')
WIDTH = 180 * mm

def fonts():
    regular = os.environ.get('PDF_FONT_REGULAR', 'C:/Windows/Fonts/arial.ttf')
    bold = os.environ.get('PDF_FONT_BOLD', 'C:/Windows/Fonts/arialbd.ttf')
    pdfmetrics.registerFont(TTFont('Business', regular))
    pdfmetrics.registerFont(TTFont('BusinessBold', bold))
    pdfmetrics.registerFontFamily('Business', normal='Business', bold='BusinessBold')
    indic = os.environ.get('PDF_FONT_INDIC', 'C:/Windows/Fonts/Nirmala.ttc')
    if os.path.exists(indic):
        pdfmetrics.registerFont(TTFont('Indic', indic, subfontIndex=0))
        pdfmetrics.registerFontFamily('Indic', normal='Indic', bold='Indic')

def p(text='', size=8.5, bold=False, color=INK, align=TA_LEFT, leading=None):
    text = str(text or '')
    font = 'BusinessBold' if bold else 'Business'
    # Use a Unicode font for Indian-script runs; retain original text in the PDF.
    escaped = escape(text).replace('\n', '<br/>')
    if 'Indic' in pdfmetrics.getRegisteredFontNames():
        escaped = re.sub(r'([\u0900-\u0DFF]+)', r'<font name="Indic">\1</font>', escaped)
    return Paragraph(escaped, ParagraphStyle('BusinessText', fontName=font, fontSize=size,
        leading=leading or size * 1.45, textColor=color, alignment=align,
        splitLongWords=True, spaceAfter=0, allowWidows=0, allowOrphans=0, shaping=bool(importlib.util.find_spec('uharfbuzz'))))

def heading(text):
    return p(text, 7.3, True, BROWN)

def table(rows, widths, padding=0, **kwargs):
    t = Table(rows, colWidths=widths, hAlign='LEFT', **kwargs)
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),padding),('RIGHTPADDING',(0,0),(-1,-1),padding),
        ('TOPPADDING',(0,0),(-1,-1),padding),('BOTTOMPADDING',(0,0),(-1,-1),padding)]))
    return t

def address(value, label, same=False):
    content = [heading(label + (' · Same as billing' if same else '')), Spacer(1,2.5*mm),p(value.get('name','Customer'),10,True),Spacer(1,1.5*mm),
        p(value.get('address') or 'Address not recorded',8,color=MOCHA)]
    for key, prefix in [('contactName','Contact person: '),('phone','Contact '),('email','')]:
        if value.get(key): content += [Spacer(1,mm),p(prefix+value[key],7.5,color=MUTED)]
    content += [Spacer(1,2*mm),p('GSTIN: '+(value.get('gstin') or 'Unregistered / not recorded'),7.4),
        p('State: '+value.get('stateLabel','—'),7.4)]
    return content

class NumberedCanvas(Canvas):
    def __init__(self,*args,footer='',**kwargs):
        super().__init__(*args,**kwargs)
        self.states=[]
        self.footer=footer
    def showPage(self):
        self.states.append(dict(self.__dict__))
        self._startPage()
    def save(self):
        count=len(self.states)
        for state in self.states:
            self.__dict__.update(state)
            self.setStrokeColor(SAND)
            self.setLineWidth(.45)
            self.line(15*mm,14*mm,195*mm,14*mm)
            self.setFont('Business',7)
            self.setFillColor(MUTED)
            self.drawString(15*mm,10*mm,self.footer)
            self.drawRightString(195*mm,10*mm,f'Page {self._pageNumber} of {count}')
            super().showPage()
        super().save()

def render(m, output):
    fonts()
    b,c,v=m['business'],m['customer'],m['value']
    f=m['formatted']
    doc=BaseDocTemplate(output,pagesize=A4,rightMargin=15*mm,leftMargin=15*mm,
        topMargin=13*mm,bottomMargin=20*mm,title=m['config']['title']+' '+m['number'],
        author=b.get('name',''),pageCompression=1)
    doc.addPageTemplates(PageTemplate(id='Document',frames=[Frame(15*mm,20*mm,WIDTH,A4[1]-33*mm,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)]))
    story=[HRFlowable(width=WIDTH,thickness=4,color=BROWN),Spacer(1,3.5*mm)]
    identity=[]
    logo_image=None
    if m.get('logoData'):
        image=Image(io.BytesIO(base64.b64decode(m['logoData'])))
        ratio=min(32*mm/image.imageWidth,17*mm/image.imageHeight)
        image.drawWidth=image.imageWidth*ratio
        image.drawHeight=image.imageHeight*ratio
        image.hAlign='LEFT'
        logo_image=image
    identity += [p(b.get('name') or 'Business details not configured',17,True,MOCHA,leading=20),Spacer(1,2*mm),
        p(b.get('address',''),8.2,color=MOCHA),Spacer(1,2*mm),
        p('  ·  '.join(x for x in [b.get('phone',''),b.get('email','')] if x),7.8,color=MUTED),
        Spacer(1,2*mm),p('GSTIN: '+(b.get('gstin') or 'Not recorded'),8),p('State: '+b.get('stateLabel','—'),8)]
    if logo_image:identity=[table([[logo_image,'',identity]],[32*mm,4*mm,74*mm])]
    meta=[p(m['config']['title'],16,True,BROWN,TA_RIGHT,18),Spacer(1,3*mm),
        p(m['number'],11,True,MOCHA,TA_RIGHT),Spacer(1,3*mm),
        p('Financial year '+m['fy'],7.8,color=MUTED,align=TA_RIGHT)]
    if m['draft']:meta += [Spacer(1,2*mm),p('DRAFT — NOT ISSUED',7,True,BROWN,TA_RIGHT)]
    story += [table([[identity,meta]],[110*mm,70*mm]),Spacer(1,4*mm),HRFlowable(width=WIDTH,thickness=.5,color=SAND)]
    labels=['DOCUMENT DATE',m['config']['due'].upper(),'PLACE OF SUPPLY','REVERSE CHARGE']
    values=[f['date'],f['dueDate'],f['placeOfSupply'],'Yes' if v.get('reverseCharge') else 'No']
    if not m['config']['financial']:
        story += [Spacer(1,3*mm),table([[[heading(k),Spacer(1,mm),p(val,8.3,True)] for k,val in zip(labels,values)]],[45*mm]*4),Spacer(1,4*mm)]
        addresses=table([[address(c,'BILL TO'),'',address(m['shipTo'],'SHIP TO',m['sameShipping'])]],[87.5*mm,5*mm,87.5*mm],padding=3*mm)
        addresses.setStyle(TableStyle([('BOX',(0,0),(0,0),.5,SAND),('BOX',(2,0),(2,0),.5,SAND)]))
    else:
        story += [Spacer(1,4*mm)]
        details=[]
        for label,value in zip(labels,values):details += [heading(label),Spacer(1,.7*mm),p(value,8.2,True),Spacer(1,2*mm)]
        addresses=table([[address(c,'BILL TO'),'',details]],[104*mm,6*mm,70*mm],padding=3*mm)
        addresses.setStyle(TableStyle([('BOX',(0,0),(0,0),.5,SAND),('BACKGROUND',(2,0),(2,0),IVORY),('LINEABOVE',(2,0),(2,0),.5,SAND),('LINEBELOW',(2,0),(2,0),.5,SAND)]))
    if m['reference']:story += [p('Reference invoice: '+m['reference']),Spacer(1,2*mm)]
    if m.get('revisionLabel'):story += [p(m['revisionLabel'],7,True,BROWN),Spacer(1,2*mm)]
    story += [addresses,Spacer(1,5*mm),heading('ITEMS & SERVICES' if m['config']['financial'] else 'GOODS DISPATCHED'),Spacer(1,mm)]
    if m['config']['financial']: story += [p('All amounts in INR (₹)',6.8,color=MUTED),Spacer(1,2*mm)]
    widths=([7,48,15,12,10,18,14,21,12,23] if m['config']['financial'] else [9,109,24,20,18])
    headers=['Sr.\nNo.','Item description','HSN /\nSAC','Qty','Unit']
    if m['config']['financial']:headers+=['Rate\n(₹)','Discount','Taxable\nvalue (₹)','GST\nrate','Amount\n(₹)']
    rows=[[p(x,6.3,True,BROWN,TA_RIGHT if i in [3,5,6,7,8,9] else TA_LEFT) for i,x in enumerate(headers)]]
    for i,l in enumerate(v['lines']):
        lf=f['lines'][i]
        desc=[p(l['description'],8,True)]
        if l.get('sku'):desc += [Spacer(1,mm),p('Item code: '+l['sku'],6.8,color=MUTED)]
        if l.get('details'):desc += [Spacer(1,mm),p(l['details'],7.2,color=MOCHA)]
        cells=[p(str(i+1),7,color=MUTED),desc,p(l.get('hsn') or l.get('sac') or '—',7),p(l['quantity'],7.5,align=TA_RIGHT),p(l.get('unit') or '—',7)]
        if m['config']['financial']:
            cells += [p(lf['rate'],7.3,align=TA_RIGHT),p(lf['discount'],7,align=TA_RIGHT),p(lf['taxable'],7.3,align=TA_RIGHT),p(lf['taxRate'],7,align=TA_RIGHT),p(lf['total'],7.3,True,align=TA_RIGHT)]
        rows.append(cells)
    items=table(rows,[w*mm for w in widths],padding=1.3*mm,repeatRows=1,splitByRow=1,splitInRow=1)
    items.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),IVORY),('LINEABOVE',(0,0),(-1,0),.6,SAND),('LINEBELOW',(0,0),(-1,0),.6,SAND),('LINEBELOW',(0,1),(-1,-1),.35,SAND),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#FCFAF7')]),('TOPPADDING',(0,1),(-1,-1),2.8*mm),('BOTTOMPADDING',(0,1),(-1,-1),2.8*mm)]))
    story += [items,Spacer(1,4*mm)]
    if m['config']['financial']:
        left=[heading('AMOUNT IN WORDS'),Spacer(1,2*mm),p(m['words'],9,True,MOCHA),Spacer(1,4*mm)]
        bank=[(label,b.get(key)) for key,label in [('bankName','Bank'),('accountName','Account name'),('accountNumber','Account number'),('ifsc','IFSC'),('upi','UPI')] if b.get(key)]
        if bank:
            left += [heading('BANK & PAYMENT DETAILS'),Spacer(1,2*mm)]
            for label,val in bank:left += [p(label+': '+val,7.5),Spacer(1,mm)]
        left += [Spacer(1,2*mm),p('Rates are '+('inclusive of GST.' if v['pricing']=='inclusive' else 'exclusive of GST.'),7,color=MUTED)]
        totals=[]
        for label,val,style in f['totals']:
            totals.append([p(label,10 if style=='grand' else 8,style in ['grand','balance'],MOCHA),p(val,10 if style=='grand' else 8,style in ['grand','balance'],MOCHA,TA_RIGHT)])
        sums=table(totals,[34*mm,32*mm],padding=1.05*mm)
        styles=[('BOX',(0,0),(-1,-1),.6,SAND)]
        for i,(_,_,style) in enumerate(f['totals']):
            if style=='grand':styles += [('BACKGROUND',(0,i),(-1,i),IVORY),('LINEABOVE',(0,i),(-1,i),.6,SAND),('LINEBELOW',(0,i),(-1,i),.6,SAND)]
        sums.setStyle(TableStyle(styles))
        story += [table([[left,'',sums]],[105*mm,9*mm,66*mm]),Spacer(1,4*mm)]
    if f['payments']:
        story += [heading('PAYMENTS RECEIVED'),Spacer(1,2*mm)]
        receipts=[[heading('DATE'),heading('MODE'),heading('TRANSACTION REFERENCE'),p('AMOUNT (₹)',7,True,BROWN,TA_RIGHT)]]
        receipts += [[p(x['date'],7.5),p(x['method'],7.5),p(x['reference'],7.5),p(x['amount'],7.5,align=TA_RIGHT)] for x in f['payments']]
        t=table(receipts,[29*mm,30*mm,88*mm,33*mm],padding=2*mm,repeatRows=1,splitInRow=1)
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),IVORY),('LINEBELOW',(0,0),(-1,-1),.4,SAND)]))
        story += [t,Spacer(1,4*mm)]
    notes=[heading('CUSTOMER NOTES'),Spacer(1,2*mm),p(m['notes'] or 'No additional customer notes.',7.8,color=MOCHA),Spacer(1,3*mm),heading('TERMS & CONDITIONS'),Spacer(1,2*mm),p(m['terms'] or 'No additional terms recorded.',7.8,color=MOCHA)]
    signature=[p('For '+(b.get('name') or 'the business'),8,True,BROWN,TA_CENTER),Spacer(1,5*mm),p('Company stamp / signature',7,color=MUTED,align=TA_CENTER),Spacer(1,2*mm),HRFlowable(width=58*mm,thickness=.5,color=SAND),Spacer(1,2*mm),p('Authorised signatory'+(' · '+b['signatoryName'] if b.get('signatoryName') else ''),7.4,align=TA_CENTER)]
    story += [HRFlowable(width=WIDTH,thickness=.5,color=SAND),Spacer(1,4*mm),table([[notes,'',table([[signature]],[60*mm])]],[108*mm,12*mm,60*mm],splitInRow=1)]
    if m['kind']=='delivery':story += [p('Received by: __________________  Date: __________  Signature: ______________',8)]
    if m['config'].get('note'):story.insert(3,p(m['config']['note'],7,color=MUTED))
    doc.build(story,canvasmaker=lambda *a,**kw:NumberedCanvas(*a,footer=m['config']['title']+'  ·  '+m['number'],**kw))

if __name__=='__main__':
    with open(sys.argv[1],encoding='utf-8') as source: model=json.load(source)
    render(model,sys.argv[2])
