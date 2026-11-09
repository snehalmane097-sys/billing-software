// All monetary results are integer paise; intermediate arithmetic uses BigInt.
import { itemMetadata } from './catalogue.mjs';
export function fixed(value, scale = 2) {
    const s = String(value ?? '0');
    if (!new RegExp(`^\\d{1,9}(?:\\.\\d{1,${scale}})?$`).test(s))
        throw Error(`Enter a non-negative number with at most ${scale} decimals`);
    const [whole, frac = ''] = s.split('.');
    return BigInt(whole) * 10n ** BigInt(scale) + BigInt(frac.padEnd(scale, '0'));
}
export const round = (n, d) => (n + d / 2n) / d;
export const minor = value => Number(fixed(value));
export const amount = n => (Number(n) / 100).toFixed(2);
export function calculate(input, businessState) {
    if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100)
        throw Error('Add between 1 and 100 item rows');
    const interstate = input.placeOfSupply !== businessState;
    let grossAmount = 0n, discountTotal = 0n, subtotal = 0n, cgst = 0n, sgst = 0n, igst = 0n, inclusiveAdjustment = 0n;
    if (!['exclusive', 'inclusive'].includes(input.pricing))
        throw Error('Choose inclusive or exclusive pricing');
    const lines = input.lines.map(l => {
        if (!l.description?.trim() || l.description.length > 250)
            throw Error('An item description is required (maximum 250 characters)');
        const metadata = itemMetadata(l);
        const qty = fixed(l.quantity, 3), rate = fixed(l.rate), discount = fixed(l.discount || '0'), tax = fixed(l.taxRate || '0');
        if (qty === 0n || discount > 10000n || tax > 10000n)
            throw Error('Check quantity, discount (0-100%), and GST rate (0-100%)');
        const gross = round(qty * rate, 1000n);
        const quoted = round(qty * rate * (10000n - discount), 1000n * 10000n);
        const discountAmount = gross - quoted;
        grossAmount += gross; discountTotal += discountAmount;
        if(grossAmount > BigInt(Number.MAX_SAFE_INTEGER))throw Error('Document gross amount exceeds supported limit');
        let base = quoted;
        if (input.pricing === 'inclusive')
            base = round(base * 10000n, 10000n + tax);
        const c = interstate ? 0n : round(base * tax, 20000n), s = c, i = interstate ? round(base * tax, 10000n) : 0n;
        const computed = base + c + s + i;
        const adjustment = input.pricing === 'inclusive' ? quoted - computed : 0n;
        inclusiveAdjustment += adjustment;
        subtotal += base;
        cgst += c;
        sgst += s;
        igst += i;
        return { ...metadata, description: l.description.trim(), quantity: String(l.quantity), rate: String(l.rate), discount: String(l.discount || '0'), taxRate: l.taxRate == null || String(l.taxRate).trim() === '' ? '' : String(l.taxRate), grossAmount: Number(gross), discountAmount: Number(discountAmount), taxable: Number(base), cgst: Number(c), sgst: Number(s), igst: Number(i), roundingAdjustment: Number(adjustment), total: Number(computed + adjustment) };
    });
    const components = subtotal + cgst + sgst + igst, before = components + inclusiveAdjustment;
    const total = input.rounding ? round(before, 100n) * 100n : before;
    if (total > 900000000000n)
        throw Error('Document exceeds supported limit');
    return { lines, grossAmount: Number(grossAmount), discountTotal: Number(discountTotal), subtotal: Number(subtotal), cgst: Number(cgst), sgst: Number(sgst), igst: Number(igst), roundOff: Number(total - components), total: Number(total), interstate };
}
