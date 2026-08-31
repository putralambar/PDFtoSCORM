# Beamer PDF to SCORM Annotator - Flask

Aplikasi Flask lokal untuk mengubah PDF Beamer menjadi SCORM 2004 dengan anotasi per slide.

## Perubahan utama

PDF tidak ditampilkan sebagai dokumen utuh di SCORM. Saat konversi:

1. Setiap halaman PDF dirender menjadi PNG terpisah.
2. Halaman 1 menjadi `slide-001.png`, halaman 2 menjadi `slide-002.png`, dan seterusnya.
3. Player SCORM menampilkan tepat satu slide pada satu waktu.
4. Pen, highlighter, eraser, undo, dan clear disimpan terpisah per slide.
5. Navigasi tersedia melalui Previous/Next, nomor slide, keyboard panah, PageUp/PageDown, dan fullscreen.
6. PDF sumber tidak dimasukkan ke paket SCORM.
7. Kualitas render slide dapat dipilih: Full HD 1920 px, QHD 2560 px, atau 4K 3840 px. Rendering dilakukan langsung dari PDF agar teks dan diagram tetap tajam.

## Menjalankan di Windows

Cara termudah:

```bat
run_windows.bat
```

Kemudian buka:

```text
http://127.0.0.1:5000
```

## Manual

```bat
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

## Output

File ZIP berisi struktur SCORM 2004, misalnya:

```text
imsmanifest.xml
index.html
assets/
  player.js
  player.css
  scorm.js
  slides/
    slide-001.png
    slide-002.png
    slide-003.png
```

## Catatan anotasi

Anotasi menggunakan koordinat ter-normalisasi sehingga tetap menempel pada posisi slide ketika ukuran layar berubah. Data disimpan ke SCORM `cmi.suspend_data` jika ukurannya masih aman, dengan `localStorage` sebagai fallback penuh.
