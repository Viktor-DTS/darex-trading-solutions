# ІНСТРУКЦІЯ ПО КОНВЕРТАЦІЇ ДОКУМЕНТАЦІЇ
## Перетворення Markdown файлів в Word та PDF

---

## МЕТОД 1: ЧЕРЕЗ PANDOC (РЕКОМЕНДОВАНО)

### Встановлення Pandoc:

#### Windows:
1. Завантажте Pandoc з офіційного сайту: https://pandoc.org/installing.html
2. Встановіть програму
3. Перевірте встановлення: відкрийте командний рядок та введіть `pandoc --version`

#### macOS:
```bash
brew install pandoc
```

#### Linux:
```bash
sudo apt-get install pandoc
```

### Конвертація в Word (.docx):

#### Основна інструкція:
```bash
pandoc "ІНСТРУКЦІЯ_КОРИСТУВАЧА.md" -o "ІНСТРУКЦІЯ_КОРИСТУВАЧА.docx"
```

#### З додатковими налаштуваннями:
```bash
pandoc "ІНСТРУКЦІЯ_КОРИСТУВАЧА.md" -o "ІНСТРУКЦІЯ_КОРИСТУВАЧА.docx" --reference-doc=template.docx
```

### Конвертація в PDF:

#### Через LaTeX (потрібен LaTeX):
```bash
pandoc "ІНСТРУКЦІЯ_КОРИСТУВАЧА.md" -o "ІНСТРУКЦІЯ_КОРИСТУВАЧА.pdf" --pdf-engine=xelatex
```

#### Через HTML (простіший спосіб):
```bash
pandoc "ІНСТРУКЦІЯ_КОРИСТУВАЧА.md" -o "ІНСТРУКЦІЯ_КОРИСТУВАЧА.pdf" --pdf-engine=wkhtmltopdf
```

### Масове конвертування:

#### Всі файли в Word:
```bash
for file in *.md; do
    pandoc "$file" -o "${file%.md}.docx"
done
```

#### Всі файли в PDF:
```bash
for file in *.md; do
    pandoc "$file" -o "${file%.md}.pdf" --pdf-engine=wkhtmltopdf
done
```

---

## МЕТОД 2: ЧЕРЕЗ ONLINE КОНВЕРТЕРИ

### Рекомендовані сервіси:

#### 1. Pandoc Try (https://pandoc.org/try/):
- Безкоштовний
- Підтримує всі формати
- Не потребує встановлення

#### 2. Markdown to Word (https://word-to-markdown.herokuapp.com/):
- Спеціалізується на Word
- Простий інтерфейс
- Безкоштовний

#### 3. Dillinger (https://dillinger.io/):
- Онлайн редактор Markdown
- Експорт в різні формати
- Безкоштовний

### Процес конвертації:
1. Відкрийте онлайн конвертер
2. Завантажте .md файл або вставте текст
3. Виберіть цільовий формат (Word/PDF)
4. Натисніть "Конвертувати"
5. Завантажте результат

---

## МЕТОД 3: ЧЕРЕЗ VS CODE

### Встановлення розширень:

#### Markdown PDF:
1. Відкрийте VS Code
2. Перейдіть в Extensions (Ctrl+Shift+X)
3. Знайдіть "Markdown PDF"
4. Встановіть розширення

### Конвертація:
1. Відкрийте .md файл в VS Code
2. Натисніть Ctrl+Shift+P
3. Введіть "Markdown PDF: Export (pdf)"
4. Виберіть місце збереження

### Налаштування:
1. Відкрийте налаштування VS Code
2. Знайдіть "markdown-pdf"
3. Налаштуйте стилі та параметри

---

## МЕТОД 4: ЧЕРЕЗ GITHUB

### GitHub Pages:
1. Завантажте файли в GitHub репозиторій
2. Увімкніть GitHub Pages
3. Файли будуть доступні як веб-сторінки
4. Використовуйте "Print to PDF" в браузері

### GitHub Actions:
Створіть файл `.github/workflows/convert.yml`:
```yaml
name: Convert Markdown to PDF
on:
  push:
    paths:
      - '*.md'
jobs:
  convert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Convert to PDF
        uses: docker://pandoc/latex:latest
        with:
          args: >
            -f markdown
            -t pdf
            -o output.pdf
            *.md
      - name: Upload PDF
        uses: actions/upload-artifact@v2
        with:
          name: documentation
          path: output.pdf
```

---

## МЕТОД 5: ЧЕРЕЗ TYPOРА

### Встановлення Typora:
1. Завантажте Typora з https://typora.io/
2. Встановіть програму
3. Відкрийте .md файл

### Експорт:
1. Відкрийте меню File → Export
2. Виберіть формат (Word/PDF)
3. Налаштуйте параметри
4. Натисніть "Export"

---

## НАЛАШТУВАННЯ СТИЛІВ

### Створення шаблону Word:

#### 1. Створіть шаблон:
```bash
pandoc --print-default-data-file reference.docx > template.docx
```

#### 2. Відредагуйте шаблон:
- Відкрийте template.docx в Word
- Налаштуйте стилі заголовків
- Налаштуйте шрифти та розміри
- Збережіть шаблон

#### 3. Використовуйте шаблон:
```bash
pandoc input.md -o output.docx --reference-doc=template.docx
```

### Налаштування PDF стилів:

#### CSS файл для PDF:
```css
body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
}

h1, h2, h3 {
    color: #333;
    border-bottom: 2px solid #333;
    padding-bottom: 10px;
}

code {
    background-color: #f4f4f4;
    padding: 2px 4px;
    border-radius: 3px;
}

pre {
    background-color: #f4f4f4;
    padding: 10px;
    border-radius: 5px;
    overflow-x: auto;
}

table {
    border-collapse: collapse;
    width: 100%;
}

th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

th {
    background-color: #f2f2f2;
}
```

#### Використання CSS:
```bash
pandoc input.md -o output.pdf --css=style.css --pdf-engine=wkhtmltopdf
```

---

## АВТОМАТИЗАЦІЯ

### Batch скрипт для Windows:

#### convert.bat:
```batch
@echo off
echo Converting Markdown files to Word and PDF...

for %%f in (*.md) do (
    echo Converting %%f...
    pandoc "%%f" -o "%%~nf.docx"
    pandoc "%%f" -o "%%~nf.pdf" --pdf-engine=wkhtmltopdf
)

echo Conversion complete!
pause
```

### Shell скрипт для Linux/macOS:

#### convert.sh:
```bash
#!/bin/bash
echo "Converting Markdown files to Word and PDF..."

for file in *.md; do
    echo "Converting $file..."
    pandoc "$file" -o "${file%.md}.docx"
    pandoc "$file" -o "${file%.md}.pdf" --pdf-engine=wkhtmltopdf
done

echo "Conversion complete!"
```

#### Зробити виконуваним:
```bash
chmod +x convert.sh
./convert.sh
```

---

## РЕКОМЕНДАЦІЇ

### Для Word документів:
1. Використовуйте шаблон для консистентності
2. Перевіряйте форматування після конвертації
3. Додавайте зміст та індекс
4. Використовуйте стилі заголовків

### Для PDF документів:
1. Використовуйте CSS для стилізації
2. Перевіряйте розриви сторінок
3. Додавайте закладки для навігації
4. Оптимізуйте розмір файлу

### Загальні поради:
1. Зберігайте оригінальні .md файли
2. Використовуйте версійний контроль (Git)
3. Тестуйте конвертацію на різних файлах
4. Документуйте процес конвертації

---

## УСУНЕННЯ ПРОБЛЕМ

### Проблеми з кодуванням:
```bash
pandoc input.md -o output.docx --from markdown+smart
```

### Проблеми з таблицями:
```bash
pandoc input.md -o output.docx --from markdown+pipe_tables
```

### Проблеми з зображеннями:
```bash
pandoc input.md -o output.docx --extract-media=./media
```

### Проблеми з PDF:
```bash
pandoc input.md -o output.pdf --pdf-engine=xelatex -V geometry:margin=1in
```

---

## КОНТАКТИ

### Підтримка Pandoc:
- **Документація:** https://pandoc.org/MANUAL.html
- **Форум:** https://github.com/jgm/pandoc/discussions
- **GitHub:** https://github.com/jgm/pandoc

### Альтернативні інструменти:
- **Mark Text:** https://marktext.app/
- **Zettlr:** https://www.zettlr.com/
- **Obsidian:** https://obsidian.md/

---

*Інструкція по конвертації оновлена: Вересень 2025*  
*Версія: 1.0*
