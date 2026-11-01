from pathlib import Path

import pymupdf


pdf_path = Path("attached_assets/MaydanGo_Partner_Portal_Copy_Revised_1793551476429.pdf")
output_dir = Path(".agents/outputs/revised-portal-copy-inspection")
output_dir.mkdir(parents=True, exist_ok=True)

document = pymupdf.open(pdf_path)
print(f"Pages: {document.page_count}")
print(f"Metadata: {document.metadata}")

extracted_pages = []
for index, page in enumerate(document):
    text = page.get_text("text")
    extracted_pages.append(f"--- PAGE {index + 1} ---\n{text}")

extracted_path = output_dir / "page-text.txt"
extracted_path.write_text("\n".join(extracted_pages), encoding="utf-8")
print(f"Extracted page text: {extracted_path}")

page_indexes = sorted({0, 1, document.page_count - 1})
for index in page_indexes:
    pixmap = document[index].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
    output_path = output_dir / f"page-{index + 1:02}.png"
    pixmap.save(output_path)
    print(f"Rendered: {output_path}")
