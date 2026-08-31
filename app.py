from flask import Flask, render_template, request, send_file, jsonify
from werkzeug.utils import secure_filename
import html
import shutil
import zipfile
import uuid
from pathlib import Path

import fitz  # PyMuPDF

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
BUILD_DIR = BASE_DIR / 'builds'
BUILD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {'pdf'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def safe_xml(value):
    return html.escape(value, quote=True)


@app.route('/')
def index():
    return render_template('index.html')


@app.post('/convert')
def convert():
    pdf = request.files.get('pdf')
    title = request.form.get('title', 'Beamer Presentation').strip() or 'Beamer Presentation'
    identifier = request.form.get('identifier', 'beamer-scorm').strip() or 'beamer-scorm'
    quality = request.form.get('quality', '1920').strip()
    try:
        target_width = int(quality)
    except ValueError:
        target_width = 1920
    if target_width not in (1920, 2560, 3840):
        target_width = 1920

    if not pdf or not allowed_file(pdf.filename):
        return jsonify({'ok': False, 'error': 'File PDF tidak valid.'}), 400

    job_id = uuid.uuid4().hex[:10]
    job_dir = BUILD_DIR / job_id
    assets = job_dir / 'assets'
    slides_dir = assets / 'slides'
    slides_dir.mkdir(parents=True, exist_ok=True)

    input_pdf = job_dir / (secure_filename(pdf.filename) or 'presentation.pdf')
    pdf.save(input_pdf)

    try:
        doc = fitz.open(input_pdf)
        if doc.page_count == 0:
            raise ValueError('PDF tidak memiliki halaman.')

        # Render directly from the PDF vector page to HD/QHD/4K PNG.
        # The target is based on pixel width and the source aspect ratio is preserved.
        slide_files = []

        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            page_width_pt = page.rect.width
            zoom = target_width / page_width_pt
            matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=matrix, alpha=False, annots=True)
            slide_name = f'slide-{page_index + 1:03d}.png'
            slide_path = slides_dir / slide_name
            pix.save(slide_path)
            slide_files.append(f'assets/slides/{slide_name}')

        slide_count = doc.page_count
        doc.close()
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        return jsonify({'ok': False, 'error': f'Gagal membaca PDF: {exc}'}), 400

    # Source PDF is intentionally removed. SCORM contains individual slide images only.
    input_pdf.unlink(missing_ok=True)

    shutil.copy(BASE_DIR / 'static' / 'player.js', assets / 'player.js')
    shutil.copy(BASE_DIR / 'static' / 'player.css', assets / 'player.css')
    shutil.copy(BASE_DIR / 'static' / 'scorm.js', assets / 'scorm.js')

    (job_dir / 'index.html').write_text(
        render_template(
            'scorm_player.html',
            title=title,
            slide_count=slide_count,
            slide_files=slide_files,
        ),
        encoding='utf-8',
    )

    xml_title = safe_xml(title)
    xml_identifier = safe_xml(identifier)
    file_entries = '\n'.join(f'      <file href="{safe_xml(path)}"/>' for path in slide_files)

    manifest = f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{xml_identifier}" version="1"
 xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
 xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
 xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
 xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
 xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="ORG1">
    <organization identifier="ORG1">
      <title>{xml_title}</title>
      <item identifier="ITEM1" identifierref="RES1">
        <title>{xml_title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent" adlcp:scormType="sco" href="index.html">
      <file href="index.html"/>
      <file href="assets/player.js"/>
      <file href="assets/player.css"/>
      <file href="assets/scorm.js"/>
{file_entries}
    </resource>
  </resources>
</manifest>
'''
    (job_dir / 'imsmanifest.xml').write_text(manifest, encoding='utf-8')

    zip_path = BUILD_DIR / f'{job_id}.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file in job_dir.rglob('*'):
            if file.is_file():
                zf.write(file, file.relative_to(job_dir))

    return jsonify({
        'ok': True,
        'download': f'/download/{job_id}',
        'filename': f'{identifier}.zip',
        'slides': slide_count,
        'render_width': target_width,
    })


@app.get('/download/<job_id>')
def download(job_id):
    zip_path = BUILD_DIR / f'{job_id}.zip'
    if not zip_path.exists():
        return 'File tidak ditemukan', 404
    return send_file(zip_path, as_attachment=True, download_name=f'beamer-scorm-{job_id}.zip')


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
