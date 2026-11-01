from pathlib import Path
import fitz

source = Path("attached_assets/Multi_makan_events_1792926709671.pdf")
output_dir = Path(".agents/outputs/multimakan-events")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"Pages: {document.page_count}")
print(f"Metadata: {document.metadata}")
for index, page in enumerate(document, start=1):
    print(f"\n--- PAGE {index} ---\n{page.get_text()}")
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    output_path = output_dir / f"page-{index}.png"
    pixmap.save(output_path)
    print(f"Rendered: {output_path}")
