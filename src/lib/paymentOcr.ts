/** Reads a payment screenshot in the browser (tesseract.js) and pulls out the amount candidates and the transaction id. */
export interface OcrResult { amounts: number[]; reference: string | null; text: string }

export async function readPaymentScreenshot(file: File): Promise<OcrResult> {
  // @ts-ignore - tesseract.js ships its own types once installed
  const { recognize } = await import('tesseract.js');
  const { data } = await recognize(file, 'eng');
  return parseText(String(data?.text || ''));
}

export function parseText(text: string): OcrResult {
  const amounts = new Set<number>();
  const re = /(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0 && n < 10000000) amounts.add(n);
  }
  let reference: string | null = null;
  const labelled = text.match(/(?:utr|upi\s*ref(?:erence)?(?:\s*(?:no|number|id))?|ref(?:erence)?\s*(?:no|number|id)|txn\s*id|transaction\s*id|order\s*id)\s*[:#\-]?\s*([A-Za-z0-9]{8,30})/i);
  if (labelled) reference = labelled[1];
  if (!reference) { const twelve = text.match(/\b\d{12}\b/); if (twelve) reference = twelve[0]; }
  if (!reference) { const t = text.match(/\bT\d{18,}\b/); if (t) reference = t[0]; }
  return { amounts: [...amounts], reference, text };
}
