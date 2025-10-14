from http.server import BaseHTTPRequestHandler
import pandas as pd
import io
import json
import re

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Parse the multipart form data
            content_type = self.headers.get('Content-Type', '')
            
            if 'multipart/form-data' not in content_type:
                self.send_error_response(400, 'Invalid content type')
                return
            
            # Extract boundary
            boundary = content_type.split('boundary=')[1].encode()
            
            # Read the body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            # Parse multipart data
            parsed_data = self.parse_multipart(body, boundary)
            
            if not parsed_data['file']:
                self.send_error_response(400, 'No file uploaded')
                return
            
            file_data = parsed_data['file']
            action = parsed_data.get('action', 'convert')
            
            # Read Excel file
            try:
                df = pd.read_excel(io.BytesIO(file_data))
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
                selected_columns_json = parsed_data.get('columns', '')
                
                if selected_columns_json:
                    try:
                        selected_columns = json.loads(selected_columns_json)
                        # Filter to only selected columns
                        df_cleaned = df_cleaned[selected_columns]
                    except Exception as e:
                        self.send_error_response(400, f'Invalid column selection: {str(e)}')
                        return
                
                # Convert to CSV
                csv_buffer = io.StringIO()
                df_cleaned.to_csv(csv_buffer, index=False)
                csv_data = csv_buffer.getvalue()
                
                # Convert to JSON
                # Using orient='records' to create array of objects
                json_data = df_cleaned.to_json(orient='records', indent=2, date_format='iso')
                
                response = {
                    'success': True,
                    'csv_data': csv_data,
                    'json_data': json_data,
                    'original_rows': original_rows,
                    'cleaned_rows': cleaned_rows,
                    'removed_rows': removed_rows
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
    
    def parse_multipart(self, body, boundary):
        """Parse multipart form data to extract file content and form fields"""
        result = {'file': None}
        parts = body.split(b'--' + boundary)
        
        for part in parts:
            if not part or part == b'--\r\n' or part == b'--':
                continue
                
            # Check if this part contains a file
            if b'Content-Disposition' in part:
                # Extract field name
                disposition_line = part.split(b'\r\n')[0]
                
                if b'filename=' in disposition_line:
                    # This is a file upload
                    file_start = part.find(b'\r\n\r\n')
                    if file_start != -1:
                        file_data = part[file_start + 4:]
                        # Remove trailing CRLF if present
                        if file_data.endswith(b'\r\n'):
                            file_data = file_data[:-2]
                        result['file'] = file_data
                else:
                    # This is a regular form field
                    # Extract field name
                    name_match = re.search(b'name="([^"]+)"', disposition_line)
                    if name_match:
                        field_name = name_match.group(1).decode('utf-8')
                        
                        # Extract field value
                        value_start = part.find(b'\r\n\r\n')
                        if value_start != -1:
                            field_value = part[value_start + 4:]
                            if field_value.endswith(b'\r\n'):
                                field_value = field_value[:-2]
                            result[field_name] = field_value.decode('utf-8')
        
        return result
    
    def clean_dataframe(self, df):
        """
        Clean the dataframe by removing:
        1. Completely empty rows at the end
        2. Rows that appear to be disclaimers or metadata
        3. Rows after benchmark indices (optional stop point)
        """
        rows_to_keep = []
        
        for idx, row in df.iterrows():
            # Convert row to string and check if it's mostly empty
            row_str = ' '.join([str(val) for val in row if pd.notna(val)]).strip()
            
            # Skip completely empty rows
            if not row_str:
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
            
            # Check if this is a benchmark index row (optional end marker)
            if 'benchmark' in row_str.lower() and 'index' in row_str.lower():
                rows_to_keep.append(idx)
                # Stop here - everything after benchmark is usually metadata
                break
            
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
