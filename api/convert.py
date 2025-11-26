from http.server import BaseHTTPRequestHandler
import pandas as pd
import io
import json
import re
import cgi

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Parse multipart form data using cgi
            content_type = self.headers.get('Content-Type', '')
            
            if 'multipart/form-data' not in content_type:
                self.send_error_response(400, 'Invalid content type')
                return
            
            # Read the body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            # Parse using cgi.FieldStorage
            environ = {
                'REQUEST_METHOD': 'POST',
                'CONTENT_TYPE': content_type,
                'CONTENT_LENGTH': str(content_length),
            }
            
            form = cgi.FieldStorage(
                fp=io.BytesIO(body),
                headers=self.headers,
                environ=environ
            )
            
            # Extract file
            if 'file' not in form:
                self.send_error_response(400, 'No file uploaded')
                return
            
            file_item = form['file']
            if not file_item.file:
                self.send_error_response(400, 'No file uploaded')
                return
            
            file_data = file_item.file.read()
            
            # Extract action
            action = form.getvalue('action', 'convert')
            
            # Handle different actions
            if action == 'get_preview':
                # Get raw preview of first rows without any header assumption
                try:
                    df_raw = pd.read_excel(io.BytesIO(file_data), header=None)
                except Exception as e:
                    self.send_error_response(400, f'Failed to read Excel file: {str(e)}')
                    return
                
                # Get first 10 rows for preview
                preview_rows = df_raw.head(10).values.tolist()
                
                # Convert to JSON-serializable format
                preview_data = []
                for row in preview_rows:
                    preview_data.append([str(cell) if cell is not None and str(cell) != 'nan' else '' for cell in row])
                
                response = {
                    'success': True,
                    'rows': preview_data,
                    'total_rows': len(df_raw)
                }
                
                # Send response
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode())
                return
            
            # For other actions, get header_row parameter
            header_row = int(form.getvalue('header_row', '0'))
            
            # Read Excel file with specified header row
            try:
                df = pd.read_excel(io.BytesIO(file_data), header=header_row)
            except Exception as e:
                self.send_error_response(400, f'Failed to read Excel file: {str(e)}')
                return
            
            # Clean the dataframe
            original_rows = len(df)
            df_cleaned = self.clean_dataframe(df)
            cleaned_rows = len(df_cleaned)
            removed_rows = original_rows - cleaned_rows
            
            # Handle different actions
            if action == 'get_headers':
                # Return column headers
                columns = df_cleaned.columns.tolist()
                response = {
                    'success': True,
                    'columns': columns,
                    'total_rows': cleaned_rows
                }
            else:
                # Convert with selected columns
                selected_columns_json = form.getvalue('columns', '')

                if selected_columns_json:
                    try:
                        selected_columns = json.loads(selected_columns_json)
                        # Filter to only selected columns
                        df_cleaned = df_cleaned[selected_columns]
                    except Exception as e:
                        self.send_error_response(400, f'Invalid column selection: {str(e)}')
                        return

                # Handle row exclusion from bottom
                exclude_rows = int(form.getvalue('exclude_rows', '0'))
                if exclude_rows > 0:
                    # Exclude rows from the bottom
                    if exclude_rows >= len(df_cleaned):
                        # If excluding all rows, return empty dataframe
                        df_cleaned = df_cleaned.iloc[0:0]
                    else:
                        df_cleaned = df_cleaned.iloc[:-exclude_rows]

                # Update final row count after exclusion
                final_rows = len(df_cleaned)

                # Convert to CSV
                csv_buffer = io.StringIO()
                df_cleaned.to_csv(csv_buffer, index=False)
                csv_data = csv_buffer.getvalue()

                # Convert to JSON
                json_data = df_cleaned.to_json(orient='records', indent=2, date_format='iso')

                response = {
                    'success': True,
                    'csv_data': csv_data,
                    'json_data': json_data,
                    'original_rows': original_rows,
                    'cleaned_rows': final_rows,
                    'removed_rows': removed_rows,
                    'excluded_rows': exclude_rows
                }
            
            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            self.send_error_response(500, f'Internal server error: {str(e)}')
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def clean_dataframe(self, df):
        """
        Clean the dataframe by removing:
        1. Completely empty rows
        2. Rows that are disclaimers or metadata
        3. Separator rows (all dashes, equals, etc.)
        Keep everything else - no hardcoded names!
        """
        rows_to_keep = []
        
        for idx, row in df.iterrows():
            # Convert row to string and check if it's mostly empty
            row_str = ' '.join([str(val) for val in row if pd.notna(val)]).strip()
            
            # Skip completely empty rows
            if not row_str:
                continue
            
            # Skip separator rows (all dashes, equals, underscores, etc.)
            if re.match(r'^[-=_\s]+$', row_str):
                continue
            
            # Check for common disclaimer patterns
            disclaimer_patterns = [
                r'^source:',
                r'^data as on',
                r'^report generated',
                r'^\*.*returns',
                r'^note:',
                r'^disclaimer',
                r'^less than \d+ year',
                r'compound annualized',
                r'absolute returns',
            ]
            
            # Check if row matches any disclaimer pattern
            is_disclaimer = any(re.search(pattern, row_str, re.IGNORECASE) 
                              for pattern in disclaimer_patterns)
            
            if is_disclaimer:
                continue
            
            # Keep everything else - no special cases!
            rows_to_keep.append(idx)
        
        # Return cleaned dataframe
        if rows_to_keep:
            return df.loc[rows_to_keep].reset_index(drop=True)
        return df
    
    def send_error_response(self, code, message):
        """Send an error response"""
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        error_response = {
            'success': False,
            'error': message
        }
        self.wfile.write(json.dumps(error_response).encode())
