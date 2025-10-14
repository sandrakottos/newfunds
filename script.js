let selectedFile = null;
let convertedCsvData = null;
let convertedJsonData = null;
let availableColumns = [];

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
    fileInput.value = '';
    fileInfo.style.display = 'none';
    uploadArea.style.display = 'block';
    hideError();
    hideResult();
    hideColumnSelection();
});

// Convert button handler - First step: Get headers
convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    
    hideError();
    hideResult();
    hideColumnSelection();
    fileInfo.style.display = 'none';
    loading.style.display = 'block';
    
    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'get_headers');
        
        const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to process file');
        }
        
        const data = await response.json();
        availableColumns = data.columns;
        
        loading.style.display = 'none';
        showColumnSelection(availableColumns);
        
    } catch (err) {
        loading.style.display = 'none';
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
        
        const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Conversion failed');
        }
        
        const data = await response.json();
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
