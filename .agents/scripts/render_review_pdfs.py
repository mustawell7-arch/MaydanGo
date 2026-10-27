from pathlib import Path
import fitz

ROOT = Path.cwd()
OUT = ROOT / ".agents" / "outputs" / "review-pdf-pages"
OUT.mkdir(parents=True, exist_ok=True)
FILES = [
    ROOT / "attached_assets/MaydanGO-US-English-Iraqi-Arabic-Suggestions_1792967364694.pdf",
    ROOT / "attached_assets/MaydanGO-US-English-Kurdish-Sorani-Erbil-Suggestions_1792967364694.pdf",
    ROOT / "attached_assets/MaydanGO-Best-US-English_1792967364694.pdf",
]

for pdf_path in FILES:
    doc = fitz.open(pdf_path)
    stem = pdf_path.stem.replace("MaydanGO-", "")
    cols, rows_per_sheet = 4, 5
    scale = 0.62
    page_w, page_h = doc[0].rect.width * scale, doc[0].rect.height * scale
    cell_w, cell_h = page_w + 8, page_h + 26
    per_sheet = cols * rows_per_sheet
    for start in range(0, len(doc), per_sheet):
        sheet_doc = fitz.open()
        sheet = sheet_doc.new_page(width=cols * cell_w, height=rows_per_sheet * cell_h)
        for offset in range(min(per_sheet, len(doc) - start)):
            pix = doc[start + offset].get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            x, y = (offset % cols) * cell_w, (offset // cols) * cell_h
            sheet.insert_text((x + 4, y + 17), f"Page {start + offset + 1}", fontsize=10)
            sheet.insert_image(fitz.Rect(x + 4, y + 22, x + 4 + pix.width, y + 22 + pix.height),
                               stream=pix.tobytes("png"))
        sheet_pix = sheet.get_pixmap(alpha=False)
        sheet_pix.save(OUT / f"{stem}-sheet-{start // per_sheet + 1}.png")
    for page_no in sorted({0, 1, min(2, len(doc)-1), len(doc)-1}):
        pix = doc[page_no].get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
        pix.save(OUT / f"{stem}-page-{page_no + 1}.png")
    print(f"{pdf_path.name}: rendered {len(doc)} pages")
