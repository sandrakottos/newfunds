let selectedFile = null;
let convertedCsvData = null;
let convertedJsonData = null;
let availableColumns = [];
let selectedHeaderRow = 0;
let bottomRowsData = [];
let excludedRowIndices = new Set();
let postMergerCandidates = [];
let selectedPostMergerDeletions = new Set();

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
const rowExclusion = document.getElementById('rowExclusion');
const exclusionTable = document.getElementById('exclusionTable');
const exclusionTableHead = document.getElementById('exclusionTableHead');
const exclusionTableBody = document.getElementById('exclusionTableBody');
const excludedRowsCount = document.getElementById('excludedRowsCount');
const selectAllRowsBtn = document.getElementById('selectAllRowsBtn');
const deselectAllRowsBtn = document.getElementById('deselectAllRowsBtn');
const backToColumnsBtn = document.getElementById('backToColumnsBtn');
const continueToPostMergerBtn = document.getElementById('continueToPostMergerBtn');
const postMergerReview = document.getElementById('postMergerReview');
const postMergerTable = document.getElementById('postMergerTable');
const postMergerTableHead = document.getElementById('postMergerTableHead');
const postMergerTableBody = document.getElementById('postMergerTableBody');
const postMergerSelectedCount = document.getElementById('postMergerSelectedCount');
const selectAllPostMergerBtn = document.getElementById('selectAllPostMergerBtn');
const deselectAllPostMergerBtn = document.getElementById('deselectAllPostMergerBtn');
const backToRowExclusionBtn = document.getElementById('backToRowExclusionBtn');
const generateExportBtn = document.getElementById('generateExportBtn');
const result = document.getElementById('result');
const resultMessage = document.getElementById('resultMessage');
const postMergerReport = document.getElementById('postMergerReport');
const postMergerDeleted = document.getElementById('postMergerDeleted');
const postMergerDeletedList = document.getElementById('postMergerDeletedList');
const postMergerSkipped = document.getElementById('postMergerSkipped');
const postMergerSkippedList = document.getElementById('postMergerSkippedList');
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
    hideRowExclusion();
    hidePostMergerReview();
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
    hideRowExclusion();
    hidePostMergerReview();
    hideRowPreview();
});

// Convert button handler - First step: Show row preview
convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    
    hideError();
    hideResult();
    hideColumnSelection();
    hideRowExclusion();
    hidePostMergerReview();
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

// Proceed button - Go to row exclusion
proceedBtn.addEventListener('click', async () => {
    const checkboxes = columnsGrid.querySelectorAll('input[type="checkbox"]:checked');
    const selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        showError('Please select at least one column');
        return;
    }

    // Store selected columns for later use
    availableColumns = selectedColumns;

    hideError();
    columnSelection.style.display = 'none';
    loading.style.display = 'block';

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'get_bottom_rows');
        formData.append('header_row', selectedHeaderRow);
        formData.append('columns', JSON.stringify(selectedColumns));

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
        showRowExclusion(data.rows, data.columns, data.total_rows);

    } catch (err) {
        loading.style.display = 'none';
        columnSelection.style.display = 'block';
        showError(err.message || 'An error occurred while processing the file');
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
    bottomRowsData = [];
    excludedRowIndices.clear();
    postMergerCandidates = [];
    selectedPostMergerDeletions.clear();
    fileInput.value = '';
    result.style.display = 'none';
    postMergerReport.style.display = 'none';
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

// Hide row exclusion
function hideRowExclusion() {
    rowExclusion.style.display = 'none';
}

// Show POST MERGER review UI
function showPostMergerReview(candidates, skipped, columns) {
    postMergerCandidates = candidates;
    selectedPostMergerDeletions.clear();
    
    // Clear table
    postMergerTableBody.innerHTML = '';
    postMergerTableHead.innerHTML = '';
    
    // Build table header
    const headerRow = document.createElement('tr');
    headerRow.appendChild(document.createElement('th')); // Checkbox column
    headerRow.appendChild(document.createElement('th')); // Type column (Pre/Post)
    headerRow.appendChild(document.createElement('th')); // Row # column
    
    // Add column headers
    columns.forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
    });
    
    postMergerTableHead.appendChild(headerRow);
    
    // Build table body - show pairs (pre-merger above, post-merger below)
    candidates.forEach((candidate) => {
        const preMerger = candidate.pre_merger;
        const postMerger = candidate.post_merger;
        
        // Pre-merger row (will be deleted if selected)
        const preTr = document.createElement('tr');
        preTr.className = 'preview-row post-merger-pre';
        preTr.dataset.preMergerIndex = preMerger.row_index;
        
        // Checkbox cell
        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `pm-delete-${preMerger.row_index}`;
        checkbox.value = preMerger.row_index;
        checkbox.checked = true; // Default to selected
        selectedPostMergerDeletions.add(preMerger.row_index);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedPostMergerDeletions.add(preMerger.row_index);
            } else {
                selectedPostMergerDeletions.delete(preMerger.row_index);
            }
            updatePostMergerSelectedCount();
        });
        checkboxCell.appendChild(checkbox);
        preTr.appendChild(checkboxCell);
        
        // Type cell
        const typeCell = document.createElement('td');
        typeCell.className = 'row-type';
        typeCell.textContent = 'Pre-Merger';
        typeCell.style.color = '#ef4444';
        typeCell.style.fontWeight = '600';
        preTr.appendChild(typeCell);
        
        // Row number cell
        const rowNumCell = document.createElement('td');
        rowNumCell.className = 'row-number';
        rowNumCell.textContent = `Row ${preMerger.row_index + 1}`;
        preTr.appendChild(rowNumCell);
        
        // Data cells
        preMerger.values.forEach((value) => {
            const td = document.createElement('td');
            const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
            td.textContent = displayValue || '(empty)';
            td.title = value;
            preTr.appendChild(td);
        });
        
        // Make row clickable
        preTr.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        
        postMergerTableBody.appendChild(preTr);
        
        // Post-merger row (will be kept)
        const postTr = document.createElement('tr');
        postTr.className = 'preview-row post-merger-post';
        postTr.dataset.postMergerIndex = postMerger.row_index;
        
        // Empty checkbox cell (for alignment)
        const emptyCheckboxCell = document.createElement('td');
        emptyCheckboxCell.innerHTML = '→';
        emptyCheckboxCell.style.textAlign = 'center';
        emptyCheckboxCell.style.color = '#10b981';
        emptyCheckboxCell.style.fontWeight = 'bold';
        postTr.appendChild(emptyCheckboxCell);
        
        // Type cell
        const postTypeCell = document.createElement('td');
        postTypeCell.className = 'row-type';
        postTypeCell.textContent = 'POST MERGER';
        postTypeCell.style.color = '#10b981';
        postTypeCell.style.fontWeight = '600';
        postTr.appendChild(postTypeCell);
        
        // Row number cell
        const postRowNumCell = document.createElement('td');
        postRowNumCell.className = 'row-number';
        postRowNumCell.textContent = `Row ${postMerger.row_index + 1}`;
        postTr.appendChild(postRowNumCell);
        
        // Data cells
        postMerger.values.forEach((value) => {
            const td = document.createElement('td');
            const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
            td.textContent = displayValue || '(empty)';
            td.title = value;
            postTr.appendChild(td);
        });
        
        postMergerTableBody.appendChild(postTr);
    });
    
    updatePostMergerSelectedCount();
    postMergerReview.style.display = 'block';
}

// Update POST MERGER selected count
function updatePostMergerSelectedCount() {
    const count = selectedPostMergerDeletions.size;
    if (count === 0) {
        postMergerSelectedCount.textContent = '0 pre-merger rows selected for deletion';
    } else if (count === 1) {
        postMergerSelectedCount.textContent = '1 pre-merger row selected for deletion';
    } else {
        postMergerSelectedCount.textContent = `${count} pre-merger rows selected for deletion`;
    }
}

// Hide POST MERGER review
function hidePostMergerReview() {
    postMergerReview.style.display = 'none';
}

// Select all POST MERGER deletions button
selectAllPostMergerBtn.addEventListener('click', () => {
    const checkboxes = postMergerTableBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = true;
        selectedPostMergerDeletions.add(parseInt(cb.value));
    });
    updatePostMergerSelectedCount();
});

// Deselect all POST MERGER deletions button
deselectAllPostMergerBtn.addEventListener('click', () => {
    const checkboxes = postMergerTableBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    selectedPostMergerDeletions.clear();
    updatePostMergerSelectedCount();
});

// Show row exclusion UI
function showRowExclusion(rows, columns, totalRows) {
    bottomRowsData = rows;
    excludedRowIndices.clear();
    
    // Clear table
    exclusionTableBody.innerHTML = '';
    exclusionTableHead.innerHTML = '';
    
    // Build table header
    const headerRow = document.createElement('tr');
    headerRow.appendChild(document.createElement('th')); // Checkbox column
    headerRow.appendChild(document.createElement('th')); // Row # column
    
    // Add column headers
    columns.forEach((col, idx) => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
    });
    
    exclusionTableHead.appendChild(headerRow);
    
    // Build table body with rows (displayed in reverse order - bottom rows first)
    const reversedRows = [...rows].reverse();
    
    reversedRows.forEach((rowData) => {
        const tr = document.createElement('tr');
        tr.className = 'preview-row';
        tr.dataset.rowIndex = rowData.index;
        
        // Checkbox cell
        const checkboxCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `exclude-row-${rowData.index}`;
        checkbox.value = rowData.index;
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                excludedRowIndices.add(rowData.index);
            } else {
                excludedRowIndices.delete(rowData.index);
            }
            updateExcludedRowsCount();
        });
        checkboxCell.appendChild(checkbox);
        tr.appendChild(checkboxCell);
        
        // Row number cell (show position from bottom)
        const rowNumCell = document.createElement('td');
        rowNumCell.className = 'row-number';
        rowNumCell.textContent = `Row ${rowData.display_index + 1}`;
        tr.appendChild(rowNumCell);
        
        // Data cells
        rowData.values.forEach((value) => {
            const td = document.createElement('td');
            const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
            td.textContent = displayValue || '(empty)';
            td.title = value; // Show full value on hover
            tr.appendChild(td);
        });
        
        // Make row clickable to toggle checkbox
        tr.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        
        exclusionTableBody.appendChild(tr);
    });
    
    updateExcludedRowsCount();
    rowExclusion.style.display = 'block';
}

// Update excluded rows count
function updateExcludedRowsCount() {
    const count = excludedRowIndices.size;
    if (count === 0) {
        excludedRowsCount.textContent = '0 rows selected for exclusion';
    } else if (count === 1) {
        excludedRowsCount.textContent = '1 row selected for exclusion';
    } else {
        excludedRowsCount.textContent = `${count} rows selected for exclusion`;
    }
}

// Select all rows button handler
selectAllRowsBtn.addEventListener('click', () => {
    const checkboxes = exclusionTableBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = true;
        excludedRowIndices.add(parseInt(cb.value));
    });
    updateExcludedRowsCount();
});

// Deselect all rows button handler
deselectAllRowsBtn.addEventListener('click', () => {
    const checkboxes = exclusionTableBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    excludedRowIndices.clear();
    updateExcludedRowsCount();
});

// Back to columns button handler
backToColumnsBtn.addEventListener('click', () => {
    hideRowExclusion();
    columnSelection.style.display = 'block';
});

// Continue to POST MERGER review button handler
continueToPostMergerBtn.addEventListener('click', async () => {
    hideError();
    rowExclusion.style.display = 'none';
    loading.style.display = 'block';

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'get_post_merger_candidates');
        formData.append('header_row', selectedHeaderRow);
        formData.append('columns', JSON.stringify(availableColumns));

        const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData
        });

        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) {
            if (contentType.includes('application/json')) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get POST MERGER candidates');
            } else {
                const text = await response.text();
                throw new Error(text || 'Failed to get POST MERGER candidates');
            }
        }

        const data = contentType.includes('application/json') ? await response.json() : JSON.parse(await response.text());
        postMergerCandidates = data.candidates || [];
        
        loading.style.display = 'none';
        
        // If no candidates, skip directly to export
        if (postMergerCandidates.length === 0) {
            // Skip POST MERGER review, go directly to export
            await generateExport();
        } else {
            showPostMergerReview(data.candidates, data.skipped || [], data.columns);
        }

    } catch (err) {
        loading.style.display = 'none';
        rowExclusion.style.display = 'block';
        showError(err.message || 'An error occurred while processing POST MERGER candidates');
    }
});

// Back to row exclusion button handler
backToRowExclusionBtn.addEventListener('click', () => {
    hidePostMergerReview();
    rowExclusion.style.display = 'block';
});

// Generate export button handler (final step)
generateExportBtn.addEventListener('click', async () => {
    await generateExport();
});

// Generate export function
async function generateExport() {
    hideError();
    if (postMergerReview.style.display !== 'none') {
        postMergerReview.style.display = 'none';
    }
    if (rowExclusion.style.display !== 'none') {
        rowExclusion.style.display = 'none';
    }
    loading.style.display = 'block';

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', 'convert');
        formData.append('columns', JSON.stringify(availableColumns));
        formData.append('header_row', selectedHeaderRow);
        formData.append('exclude_row_indices', JSON.stringify(Array.from(excludedRowIndices)));
        formData.append('post_merger_deletions', JSON.stringify(Array.from(selectedPostMergerDeletions)));

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
        const excludedRows = data.excluded_rows || 0;
        const postMergerDeleted = data.post_merger_deleted || 0;
        const columnsIncluded = availableColumns.length;

        // Build result message
        let messageParts = [`${cleanedRows} rows × ${columnsIncluded} columns`];
        if (removedRows > 0) {
            messageParts.push(`Removed ${removedRows} rows`);
        }
        if (excludedRows > 0) {
            messageParts.push(`Excluded ${excludedRows} rows`);
        }
        if (postMergerDeleted > 0) {
            messageParts.push(`Deleted ${postMergerDeleted} pre-merger duplicate${postMergerDeleted > 1 ? 's' : ''}`);
        }
        resultMessage.textContent = messageParts.join(' | ');

        // Hide POST MERGER report (not needed in new flow)
        postMergerReport.style.display = 'none';

    } catch (err) {
        loading.style.display = 'none';
        rowExclusion.style.display = 'block';
        showError(err.message || 'An error occurred during conversion');
    }
});

// Display POST MERGER report
function displayPostMergerReport(report) {
    // Clear previous content
    postMergerDeletedList.innerHTML = '';
    postMergerSkippedList.innerHTML = '';
    
    // Show deleted rows
    if (report.deleted && report.deleted.length > 0 && report.kept && report.kept.length > 0) {
        // Match deleted with kept rows by index order
        report.deleted.forEach((deletedItem, idx) => {
            const keptItem = report.kept[idx] || { scheme_name: 'Unknown' };
            const li = document.createElement('li');
            li.textContent = `"${deletedItem.scheme_name}" (Row ${deletedItem.row_index + 1}) → Kept "${keptItem.scheme_name}" (Row ${keptItem.row_index + 1})`;
            postMergerDeletedList.appendChild(li);
        });
        postMergerDeleted.style.display = 'block';
    } else {
        postMergerDeleted.style.display = 'none';
    }
    
    // Show skipped rows
    if (report.skipped && report.skipped.length > 0) {
        report.skipped.forEach((skippedItem) => {
            const li = document.createElement('li');
            const reasonText = skippedItem.reason || 'unknown reason';
            li.textContent = `"${skippedItem.scheme_name}" (Row ${skippedItem.row_index + 1}) - ${reasonText}`;
            postMergerSkippedList.appendChild(li);
        });
        postMergerSkipped.style.display = 'block';
    } else {
        postMergerSkipped.style.display = 'none';
    }
    
    // Show/hide report container
    if ((report.deleted && report.deleted.length > 0) || (report.skipped && report.skipped.length > 0)) {
        postMergerReport.style.display = 'block';
    } else {
        postMergerReport.style.display = 'none';
    }
}

// Hide row preview
function hideRowPreview() {
    rowPreview.style.display = 'none';
}
