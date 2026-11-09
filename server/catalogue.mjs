// Old records without itemType remain services.
export function itemMetadata(input, requireCode = false) {
    const itemType = input.itemType ?? 'service';
    if (!['product', 'service'].includes(itemType)) throw Error('Choose product or service');
    const product = itemType === 'product';
    const code = String(product ? input.hsn || '' : input.sac || '').trim();
    if (code && !(product ? /^(?:\d{4}|\d{6}|\d{8})$/ : /^\d{6}$/).test(code))
        throw Error(product ? 'Enter a 4, 6 or 8 digit HSN code; confirm the applicable classification' : 'Enter a six-digit SAC code');
    const unit = String(input.unit ?? (product ? 'NOS' : 'service')).trim();
    const sku = String(input.sku || '').trim(), details = String(input.details || '').trim();
    if (!unit || unit.length > 20) throw Error('Unit is required (maximum 20 characters)');
    if (sku.length > 64 || details.length > 500) throw Error('SKU must be at most 64 characters and details at most 500');
    return {itemType, hsn: product ? code : '', sac: product ? '' : code, unit, sku, details};
}
