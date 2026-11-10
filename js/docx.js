// docx.js — the time export's Word file, made in the browser (owner,
// 2026-11-10). quote.js says what goes in it (pure, tested); this module
// opens the template, puts the filled body and title into it, and zips it up
// again. Nothing leaves the browser: the file is handed straight to the
// person as a download.
//
// JSZIP comes from cdnjs at a fixed version the first time it is needed, and
// only then, as the importer fetches SheetJS and photos.js fetches heic2any.
//
// THE TEMPLATE is kept whole: header, footer, the letterhead's images,
// styles, page set-up. Only its main document part and its title change. A
// .dotx is accepted and comes out as a document.

import * as QT from './quote.js';

const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

let loading = null;
function loadJsZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('The Word file maker did not load.')));
    s.onerror = () => reject(new Error('The Word file maker could not be fetched from cdnjs.cloudflare.com (offline?).'));
    document.head.append(s);
  });
  loading.catch(() => { loading = null; });
  return loading;
}

/** A zip's main document and properties parts, as the package names them. */
async function partsIn(zip) {
  const rels = await zip.file('_rels/.rels')?.async('string');
  return QT.partsOf(rels ?? '');
}

/**
 * A file chosen as the template, checked: a Word document (.docx or .dotx)
 * under the size limit, with a page body this app can fill.
 * @returns {Promise<{bytes: Uint8Array, name: string, size: number}>}
 * @throws {Error} saying why not, in words for the lead
 */
export async function checkTemplate(file) {
  const name = String(file?.name ?? 'template.docx');
  if (!/\.(docx|dotx)$/i.test(name)) throw new Error(`${name} is not a Word document (.docx). Save it as a .docx in Word and upload that.`);
  if (file.size > QT.MAX_TEMPLATE_BYTES) throw new Error(`${name} is ${QT.sizeText(file.size)}; the most this app keeps is ${QT.sizeText(QT.MAX_TEMPLATE_BYTES)}. In Word, File › Compress Pictures makes it smaller.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const JSZip = await loadJsZip();
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error(`${name} will not open as a Word document. Is it saved as .docx, not .doc?`); }
  const { main } = await partsIn(zip);
  const problem = QT.templateProblem(await zip.file(main)?.async('string') ?? null);
  if (problem) throw new Error(problem);
  return { bytes, name, size: bytes.length };
}

/**
 * The finished .docx: the template (bytes; null for the plain page) with the
 * export in its body and the job's name as its title.
 * @returns {Promise<Blob>}
 */
export async function makeDocx(template, model) {
  const JSZip = await loadJsZip();
  let zip;
  if (template) zip = await JSZip.loadAsync(template);
  else {
    zip = new JSZip();
    for (const [path, xml] of Object.entries(QT.BLANK)) zip.file(path, xml);
  }
  const { main, core } = await partsIn(zip);
  const doc = await zip.file(main)?.async('string');
  if (QT.templateProblem(doc ?? null)) throw new Error('The letterhead has no page body to fill. Upload it again in Settings.');
  zip.file(main, QT.fillDocument(doc, model));
  if (core && zip.file(core)) zip.file(core, QT.fillCore(await zip.file(core).async('string'), model.title));
  const types = zip.file('[Content_Types].xml');
  if (types) zip.file('[Content_Types].xml', QT.asDocument(await types.async('string')));
  return zip.generateAsync({ type: 'blob', mimeType: QT.DOCX_TYPE, compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
