import json
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

root = Path(__file__).resolve().parents[2]
artifact_dir = root / "generated-artifacts"
template = json.loads((artifact_dir / "corporate-agreement-template.json").read_text(encoding="utf-8"))
lines = template["agreementText"].splitlines()

document = Document()
section = document.sections[0]
section.top_margin = Inches(0.85)
section.bottom_margin = Inches(0.85)
section.left_margin = Inches(1)
section.right_margin = Inches(1)

normal = document.styles["Normal"]
normal.font.name = "Times New Roman"
normal.font.size = Pt(11)
normal.font.color.rgb = RGBColor(41, 60, 50)
normal.paragraph_format.line_spacing = 1.35
normal.paragraph_format.space_after = Pt(7)

header = section.header.paragraphs[0]
header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
header_run = header.add_run("MAYDANGO  |  DISCUSSION DRAFT 0.1")
header_run.bold = True
header_run.font.name = "Arial"
header_run.font.size = Pt(8)
header_run.font.color.rgb = RGBColor(148, 75, 57)

for index, line in enumerate(lines):
    if not line.strip():
        continue
    if index == 0:
        paragraph = document.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run(line)
        run.bold = True
        run.font.name = "Arial"
        run.font.size = Pt(16)
        run.font.color.rgb = RGBColor(23, 77, 67)
    elif index == 1:
        paragraph = document.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run(line)
        run.bold = True
        run.font.name = "Arial"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(147, 75, 57)
    elif line == "IMPORTANT":
        paragraph = document.add_paragraph()
        run = paragraph.add_run(line)
        run.bold = True
        run.font.name = "Arial"
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(147, 75, 57)
    elif line[:1].isdigit() and ". " in line[:5]:
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.keep_with_next = True
        run = paragraph.add_run(line)
        run.bold = True
        run.font.name = "Arial"
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(23, 77, 67)
    elif line.startswith("This incomplete working draft"):
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.left_indent = Inches(0.15)
        paragraph.paragraph_format.right_indent = Inches(0.15)
        run = paragraph.add_run(line)
        run.bold = True
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(116, 75, 61)
    else:
        document.add_paragraph(line)

footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
footer_run = footer.add_run("DRAFT 0.1 · ENGLISH · NOT FOR SIGNATURE · Review by qualified Iraqi counsel required")
footer_run.font.name = "Arial"
footer_run.font.size = Pt(8)
footer_run.font.color.rgb = RGBColor(125, 135, 127)

document.core_properties.title = "MaydanGo Corporate Employee Enrolment Agreement — Draft 0.1"
document.core_properties.subject = "Non-binding discussion draft for legal review"
document.save(artifact_dir / "maydango-corporate-enrollment-agreement-draft-0.1.docx")
