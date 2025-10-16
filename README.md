# Excel to CSV/JSON Converter

Convert Excel files to clean CSV or JSON format. Automatically removes disclaimers, empty rows, and metadata.

## Features

- Drag & drop or browse to upload Excel files
- Select which columns to include
- Auto-removes disclaimers and empty rows
- Download as CSV or JSON
- Professional, clean interface
- Mobile responsive

## Quick Start

```bash
cd /Users/suryansh/Desktop/Newfunds
vercel
```

That's it! Your app will be live.

## How It Works

1. **Upload** Excel file (.xlsx or .xls)
2. **Select columns** you want (all selected by default)
3. **Download** in your preferred format:
   - **CSV** - for Excel, Google Sheets
   - **JSON** - for APIs, databases

## What Gets Cleaned

Automatically removes:
- Empty rows
- "Source:", "Data as on", "Report generated" rows
- Disclaimer footnotes
- Everything after "Benchmark Index" rows

## Tech Stack

- **Frontend**: HTML, CSS, Vanilla JS
- **Backend**: Python (pandas, openpyxl)
- **Deploy**: Vercel Serverless

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
vercel dev
```

## Project Structure

```
├── index.html          # Frontend UI
├── style.css           # Styling
├── script.js           # Upload & download logic
├── api/
│   └── convert.py      # Python serverless function
├── requirements.txt    # Python dependencies
└── vercel.json         # Vercel config
```

## JSON Format

Output structure:
```json
[
  {"Column1": "value1", "Column2": "value2"},
  {"Column1": "value3", "Column2": "value4"}
]
```

## Customization

To adjust disclaimer detection, edit `api/convert.py`:

```python
disclaimer_patterns = [
    r'^source:',
    r'^data as on',
    # Add your patterns here
]
```

## Browser Support

Chrome, Firefox, Safari, Edge (latest versions)

## License

MIT
