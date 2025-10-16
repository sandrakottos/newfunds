let selectedFile = null;
let convertedCsvData = null;
let convertedJsonData = null;
let availableColumns = [];
let selectedHeaderRow = 0;

// Get DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeBtn = document.getElementById('removeBtn');
const convertBtn = document.getElementById('convertBtn');
const loading = document.getElementById('loading');
const rowPreview = document.getElementById('rowPreview');
const previewTableBody = document.getElementById('previewTableBody');
const headerRowText = document.getElementById('headerRowText');
const continueBtn = document.getElementById('continueBtn');
const columnSelection = document.getElementById('columnSelection');
const columnsGrid = document.getElementById('columnsGrid');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const selectedCount = document.getElementById('selectedCount');
const proceedBtn = document.getElementById('proceedBtn');
const result = document.getElementById('result');
const resultMessage = document.getElementById('resultMessage');
const downloadCsvBtn = document.getElementById('downloadCsvBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');
const newFileBtn = document.getElementById('newFileBtn');
const error = document.getElementById('error');
const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');

// Upload area click handler
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// Browse button click handler
browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
});

// File input change handler
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
});

// Drag and drop handlers
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file) {
        handleFile(file);
    }
});

// Handle file selection
function handleFile(file) {
    // Check if file is Excel
    const validTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
        showError('Please select a valid Excel file (.xlsx or .xls)');
        return;
    }
    
    selectedFile = file;
    
    // Show file info
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    uploadArea.style.display = 'none';
    fileInfo.style.display = 'block';
    hideError();
    hideResult();
    hideColumnSelection();
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Remove file handler
removeBtn.addEventListener('click', () => {
    selectedFile = null;
    selectedHeaderRow = 0;
    fileInput.value = '';
    fileInfo.style.display = 'none';
    uploadArea.style.display = 'block';
    hideError();
    hideResult();
    hideColumnSelection();
    hideRowPreview();
});

// Convert button handler - First step: Show row preview
convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    
    hideError();
    hideResult();
    hideColumnSelection();
    hideRowPreview();
    fileInfo.style.display = 'none';
    loading.style.display = 'block';
    
    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'get_preview');
        
        const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData
        });
        
        // Try to parse JSON response safely
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
            if (contentType.includes('application/json')) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process file');
            } else {
                const text = await response.text();
                throw new Error(text || 'Failed to process file');
            }
        }
        
        const data = contentType.includes('application/json') ? await response.json() : JSON.parse(await response.text());
        
        loading.style.display = 'none';
        showRowPreview(data.rows);
        
    } catch (err) {
        loading.style.display = 'none';
        showError(err.message || 'An error occurred while processing the file');
    }
});

// Show row preview UI
function showRowPreview(rows) {
    previewTableBody.innerHTML = '';
    
    // Get max column count from all rows
    const maxCols = Math.max(...rows.map(row => row.length));
    
    // Update table header with actual column count
    const previewTable = document.getElementById('previewTable');
    const thead = previewTable.querySelector('thead tr');
    thead.innerHTML = '<th></th><th>Row #</th>'; // Reset header
    
    // Add column headers dynamically
    for (let i = 0; i < maxCols; i++) {
        const th = document.createElement('th');
        th.textContent = `Column ${String.fromCharCode(65 + i)}`; // A, B, C, etc.
        thead.appendChild(th);
    }
    
    rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        tr.className = 'preview-row';
        if (rowIndex === selectedHeaderRow) {
            tr.classList.add('selected');
        }
        
        // Radio button cell
        const radioCell = document.createElement('td');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'headerRow';
        radio.value = rowIndex;
        radio.checked = rowIndex === selectedHeaderRow;
        radio.addEventListener('change', () => {
            selectedHeaderRow = rowIndex;
            updateRowPreviewSelection();
        });
        radioCell.appendChild(radio);
        tr.appendChild(radioCell);
        
        // Row number cell
        const rowNumCell = document.createElement('td');
        rowNumCell.className = 'row-number';
        rowNumCell.textContent = rowIndex;
        tr.appendChild(rowNumCell);
        
        // Data cells (show ALL columns)
        for (let i = 0; i < maxCols; i++) {
            const td = document.createElement('td');
            const cellValue = row[i] || '';
            // Truncate long values
            const displayValue = cellValue.length > 50 ? cellValue.substring(0, 50) + '...' : cellValue;
            td.textContent = displayValue || '(empty)';
            td.title = cellValue; // Show full value on hover
            tr.appendChild(td);
        }
        
        // Make row clickable
        tr.addEventListener('click', (e) => {
            if (e.target.type !== 'radio') {
                radio.checked = true;
                selectedHeaderRow = rowIndex;
                updateRowPreviewSelection();
            }
        });
        
        previewTableBody.appendChild(tr);
    });
    
    rowPreview.style.display = 'block';
    updateHeaderRowText();
}

// Update row preview selection styling
function updateRowPreviewSelection() {
    const rows = previewTableBody.querySelectorAll('.preview-row');
    rows.forEach((row, index) => {
        if (index === selectedHeaderRow) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    });
    updateHeaderRowText();
}

// Update header row text
function updateHeaderRowText() {
    headerRowText.textContent = `Row ${selectedHeaderRow} selected as header`;
}

// Continue button handler - Proceed to get headers with selected row
continueBtn.addEventListener('click', async () => {
    hideError();
    rowPreview.style.display = 'none';
    loading.style.display = 'block';
    
    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'get_headers');
        formData.append('header_row', selectedHeaderRow);
        
        const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData
        });
        
        // Try to parse JSON response safely
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
            if (contentType.includes('application/json')) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process file');
            } else {
                const text = await response.text();
                throw new Error(text || 'Failed to process file');
            }
        }
        
        const data = contentType.includes('application/json') ? await response.json() : JSON.parse(await response.text());
        availableColumns = data.columns;
        
        loading.style.display = 'none';
        showColumnSelection(availableColumns);
        
    } catch (err) {
        loading.style.display = 'none';
        rowPreview.style.display = 'block';
        showError(err.message || 'An error occurred while processing the file');
    }
});

// Show column selection UI
function showColumnSelection(columns) {
    columnsGrid.innerHTML = '';
    
    columns.forEach((column, index) => {
        const columnItem = document.createElement('div');
        columnItem.className = 'column-item checked';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `col-${index}`;
        checkbox.value = column;
        checkbox.checked = true;
        
        const label = document.createElement('label');
        label.htmlFor = `col-${index}`;
        label.textContent = column;
        
        // Toggle checked class on change
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                columnItem.classList.add('checked');
            } else {
                columnItem.classList.remove('checked');
            }
            updateSelectedCount();
        });
        
        // Allow clicking the whole item to toggle
        columnItem.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        
        columnItem.appendChild(checkbox);
        columnItem.appendChild(label);
        columnsGrid.appendChild(columnItem);
    });
    
    columnSelection.style.display = 'block';
    updateSelectedCount();
}

// Select all button
selectAllBtn.addEventListener('click', () => {
    const checkboxes = columnsGrid.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = true;
        cb.closest('.column-item').classList.add('checked');
    });
    updateSelectedCount();
});

// Deselect all button
deselectAllBtn.addEventListener('click', () => {
    const checkboxes = columnsGrid.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
        cb.closest('.column-item').classList.remove('checked');
    });
    updateSelectedCount();
});

// Update selected count
function updateSelectedCount() {
    const checkboxes = columnsGrid.querySelectorAll('input[type="checkbox"]');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const totalCount = checkboxes.length;
    
    if (checkedCount === totalCount) {
        selectedCount.textContent = 'All columns selected';
    } else if (checkedCount === 0) {
        selectedCount.textContent = 'No columns selected';
    } else {
        selectedCount.textContent = `${checkedCount} of ${totalCount} columns selected`;
    }
}

// Proceed button - Convert with selected columns
proceedBtn.addEventListener('click', async () => {
    const checkboxes = columnsGrid.querySelectorAll('input[type="checkbox"]:checked');
    const selectedColumns = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedColumns.length === 0) {
        showError('Please select at least one column');
        return;
    }
    
    hideError();
    columnSelection.style.display = 'none';
    loading.style.display = 'block';
    
    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'convert');
        formData.append('columns', JSON.stringify(selectedColumns));
        formData.append('header_row', selectedHeaderRow);
        
        const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData
        });
        
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
            if (contentType.includes('application/json')) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Conversion failed');
            } else {
                const text = await response.text();
                throw new Error(text || 'Conversion failed');
            }
        }
        
        const data = contentType.includes('application/json') ? await response.json() : JSON.parse(await response.text());
        convertedCsvData = data.csv_data;
        convertedJsonData = data.json_data;
        
        loading.style.display = 'none';
        result.style.display = 'block';
        
        const originalRows = data.original_rows || 'N/A';
        const cleanedRows = data.cleaned_rows || 'N/A';
        const removedRows = data.removed_rows || 'N/A';
        const columnsIncluded = selectedColumns.length;
        
        resultMessage.textContent = `${cleanedRows} rows × ${columnsIncluded} columns | Removed ${removedRows} rows`;
        
    } catch (err) {
        loading.style.display = 'none';
        columnSelection.style.display = 'block';
        showError(err.message || 'An error occurred during conversion');
    }
});

// Download CSV button handler
downloadCsvBtn.addEventListener('click', () => {
    if (!convertedCsvData) return;
    
    const blob = new Blob([convertedCsvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename from original file
    const originalName = selectedFile.name.replace(/\.[^/.]+$/, '');
    a.download = `${originalName}_cleaned.csv`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
});

// Download JSON button handler
downloadJsonBtn.addEventListener('click', () => {
    if (!convertedJsonData) return;
    
    const blob = new Blob([convertedJsonData], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename from original file
    const originalName = selectedFile.name.replace(/\.[^/.]+$/, '');
    a.download = `${originalName}_cleaned.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
});

// New file button handler
newFileBtn.addEventListener('click', () => {
    selectedFile = null;
    convertedCsvData = null;
    convertedJsonData = null;
    availableColumns = [];
    selectedHeaderRow = 0;
    fileInput.value = '';
    result.style.display = 'none';
    uploadArea.style.display = 'block';
});

// Retry button handler
retryBtn.addEventListener('click', () => {
    hideError();
    uploadArea.style.display = 'block';
});

// Show error
function showError(message) {
    errorMessage.textContent = message;
    error.style.display = 'block';
    loading.style.display = 'none';
    fileInfo.style.display = 'none';
}

// Hide error
function hideError() {
    error.style.display = 'none';
}

// Hide result
function hideResult() {
    result.style.display = 'none';
}

// Hide column selection
function hideColumnSelection() {
    columnSelection.style.display = 'none';
}

// Hide row preview
function hideRowPreview() {
    rowPreview.style.display = 'none';
}
