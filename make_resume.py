from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
sec.left_margin = sec.right_margin = Inches(0.6)
sec.top_margin = sec.bottom_margin = Inches(0.5)

st = doc.styles["Normal"]
st.font.name = "Calibri"
st.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
st.font.size = Pt(10)
st.paragraph_format.space_after = Pt(0)
st.paragraph_format.space_before = Pt(0)
st.paragraph_format.line_spacing = 1.0


def para(text="", bold=False, size=None, align=None, before=0, after=0, italic=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    if align:
        p.alignment = align
    if text:
        r = p.add_run(text)
        r.bold, r.italic = bold, italic
        if size:
            r.font.size = Pt(size)
    return p


def heading(text):
    p = para(text.upper(), bold=True, size=10.5, before=7, after=2)
    pPr = p._p.get_or_add_pPr()
    b = OxmlElement("w:pBdr")
    bt = OxmlElement("w:bottom")
    for k, v in (("val", "single"), ("sz", "6"), ("space", "1"), ("color", "000000")):
        bt.set(qn("w:" + k), v)
    b.append(bt)
    pPr.append(b)


def bullet(text, lead=None):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Inches(0.2)
    pf.first_line_indent = Inches(-0.15)
    pf.space_after = Pt(1)
    p.add_run("• ")
    if lead:
        p.add_run(lead).bold = True
    p.add_run(text)


def row(left, right, bold_left=True, italic_left=False):
    p = doc.add_paragraph()
    p.paragraph_format.tab_stops.add_tab_stop(Inches(7.3), alignment=2)  # right
    r = p.add_run(left)
    r.bold, r.italic = bold_left, italic_left
    p.add_run("\t" + right)
    return p


def skill(label, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(1)
    p.add_run(label + ": ").bold = True
    p.add_run(text)


# Header
para("AZAD JANGIR", bold=True, size=20, align=WD_ALIGN_PARAGRAPH.CENTER)
para("Frontend Developer | React.js Developer | WordPress Developer", bold=True,
     size=11, align=WD_ALIGN_PARAGRAPH.CENTER)
para("Pune, Maharashtra, India | jangidazad886@gmail.com | +91 95218 12020",
     align=WD_ALIGN_PARAGRAPH.CENTER, before=2)
para("linkedin.com/in/azad-jangid-19013924b | github.com/azadjangid",
     align=WD_ALIGN_PARAGRAPH.CENTER)

heading("Professional Summary")
para("Frontend Developer with 1+ year of professional experience, including 6 months of internship, "
     "building responsive, production-ready websites and web applications with React.js, Next.js, "
     "TypeScript and JavaScript (ES6+). Experienced in REST API integration, WordPress theme and plugin "
     "customization, cross-browser compatibility and performance optimization. Seeking a Frontend / "
     "React Developer role to deliver clean, scalable user interfaces.")

heading("Technical Skills")
skill("Frontend", "React.js, Next.js, TypeScript, JavaScript (ES6+), HTML5, CSS3, Tailwind CSS, "
      "TanStack Router, Responsive Web Design")
skill("WordPress", "Custom Themes, Theme Customization, Plugin Integration, Elementor, Website Maintenance")
skill("Backend / API", "REST APIs, API Integration, JSON, PHP Basics")
skill("Tools", "Git, GitHub, GitLab, VS Code, npm, Vite, Chrome DevTools")
skill("Other", "Cross-Browser Compatibility, Debugging, Performance Optimization, SEO Fundamentals, "
      "Website Deployment")

heading("Professional Experience")
row("Frontend Developer — RohitXI Creative Consultancy", "Aug 2025 – Present")
para("Pune, Maharashtra", italic=True, after=1)
bullet("Developed and maintained responsive production websites and web applications using React.js, "
       "Next.js, TypeScript and WordPress.")
bullet("Built reusable frontend components and converted UI designs into responsive, production-ready "
       "interfaces, integrating REST APIs and third-party services.")
bullet("Customized WordPress themes, developed pages and integrated plugins for client business websites.")
bullet("Debugged frontend, API, routing and cross-browser compatibility issues to improve reliability "
       "and performance.")
bullet("Collaborated with designers and backend developers using Git/GitLab to deploy and maintain "
       "applications.")

row("Frontend Web Developer Intern — RohitXI Creative Consultancy", "Jan 2025 – Jul 2025", )
para("Pune, Maharashtra", italic=True, after=1)
bullet("Developed responsive websites and UI components using HTML5, CSS3, JavaScript and React.js.")
bullet("Assisted with WordPress theme customization, plugin integration and website maintenance for "
       "client projects.")
bullet("Tested websites across browsers and devices to ensure consistent, responsive behavior.")

heading("Projects")
bullet(" React.js, TypeScript, Vite, TailwindCSS, TanStack Router — Built a production-grade "
       "application with reusable React/TypeScript components, TanStack Router and TailwindCSS, "
       "integrating forms and APIs for core site functionality.", lead="VelaDigital |")
bullet(" React.js, JavaScript, ResponsiveUI — Developed and deployed responsive production websites "
       "with reusable UI components, focusing on performance and cross-browser consistency.",
       lead="RohitXI Tech & Mad Ad Buddy |")
bullet(" Frontend Development, ResponsiveUI — Contributed to frontend development for a "
       "business/product website, implementing responsive UI and production-ready functionality.",
       lead="ToneTag |")
bullet(" HTML, CSS, JavaScript, MongoDB (BCA Capstone) — Built a full-stack gym management system "
       "handling memberships, scheduling, attendance and payments.", lead="Gym Management System |")
bullet(" Developed and maintained 20+ WordPress websites across consulting, healthcare, real estate, "
       "technology and education domains.", lead="WordPress Projects |")

heading("Education")
row("Bachelor of Computer Applications (BCA) — Sri Balaji University, Pune | CGPA: 6.3/10", "2025")
row("Class XII (Science) — Akash Academy Sr. Sec. School, Jhunjhunu, Rajasthan | 82.83%", "2021",
    bold_left=False)
row("Certifications: LinkedIn Learning — JavaScript, React.js, Web Development", "", bold_left=False)

doc.save(r"D:\career-os\career-os\Azad_Jangir_Resume.docx")
