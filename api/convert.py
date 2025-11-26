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
            elif action == 'get_bottom_rows':
                # Get bottom rows for exclusion preview
                selected_columns_json = form.getvalue('columns', '')
                
                if selected_columns_json:
                    try:
                        selected_columns = json.loads(selected_columns_json)
                        # Filter to only selected columns
                        df_cleaned = df_cleaned[selected_columns]
                    except Exception as e:
                        self.send_error_response(400, f'Invalid column selection: {str(e)}')
                        return
                
                # Get last 30 rows (or all if less than 30)
                num_rows_to_show = min(30, len(df_cleaned))
                bottom_rows_df = df_cleaned.tail(num_rows_to_show)
                
                # Convert to list format with row indices
                # Get column names in the correct order
                column_names = df_cleaned.columns.tolist()
                bottom_rows_data = []
                for idx, row in bottom_rows_df.iterrows():
                    # Get values in the exact order of columns
                    row_values = [str(row[col]) if pd.notna(row[col]) else '' for col in column_names]
                    row_data = {
                        'index': int(idx),  # Original dataframe index (for exclusion)
                        'display_index': int(idx),  # Row number in dataframe (0-indexed)
                        'values': row_values
                    }
                    bottom_rows_data.append(row_data)
                
                response = {
                    'success': True,
                    'rows': bottom_rows_data,
                    'total_rows': len(df_cleaned),
                    'columns': df_cleaned.columns.tolist()
                }
            elif action == 'get_post_merger_candidates':
                # Get POST MERGER candidates for review
                selected_columns_json = form.getvalue('columns', '')
                
                if selected_columns_json:
                    try:
                        selected_columns = json.loads(selected_columns_json)
                        # Filter to only selected columns
                        df_cleaned = df_cleaned[selected_columns]
                    except Exception as e:
                        self.send_error_response(400, f'Invalid column selection: {str(e)}')
                        return
                
                # Get POST MERGER candidates
                candidates, skipped = self.get_post_merger_candidates(df_cleaned)
                
                response = {
                    'success': True,
                    'candidates': candidates,
                    'skipped': skipped,
                    'columns': df_cleaned.columns.tolist(),
                    'total_rows': len(df_cleaned)
                }
            elif action == 'filter_testing_columns':
                # Filter to only testing columns
                selected_columns_json = form.getvalue('columns', '')
                
                if selected_columns_json:
                    try:
                        selected_columns = json.loads(selected_columns_json)
                        # Filter to only selected columns first
                        df_cleaned = df_cleaned[selected_columns]
                    except Exception as e:
                        self.send_error_response(400, f'Invalid column selection: {str(e)}')
                        return
                
                # Handle POST MERGER deletions
                post_merger_deletions_json = form.getvalue('post_merger_deletions', '')
                if post_merger_deletions_json:
                    try:
                        post_merger_deletions = json.loads(post_merger_deletions_json)
                        if post_merger_deletions and len(post_merger_deletions) > 0:
                            deletion_set = set(post_merger_deletions)
                            df_cleaned = df_cleaned[~df_cleaned.index.isin(deletion_set)]
                    except Exception as e:
                        self.send_error_response(400, f'Invalid POST MERGER deletions: {str(e)}')
                        return
                
                # Handle row exclusion
                exclude_rows_json = form.getvalue('exclude_row_indices', '')
                if exclude_rows_json:
                    try:
                        exclude_indices = json.loads(exclude_rows_json)
                        if exclude_indices and len(exclude_indices) > 0:
                            exclude_set = set(exclude_indices)
                            df_cleaned = df_cleaned[~df_cleaned.index.isin(exclude_set)]
                    except Exception as e:
                        self.send_error_response(400, f'Invalid row exclusion indices: {str(e)}')
                        return
                
                # Define testing columns to keep
                testing_columns = [
                    'Scheme Name',
                    '6 Months - P2P',
                    '1 Year - P2P',
                    '3 Years - P2P',
                    '5 Years - P2P',
                    '10 Years - P2P',
                    'P/E',
                    'P/B',
                    'Std.Dev.',
                    'Beta',
                    'Sharpe',
                    'Information Ratio',
                    'Sortino',
                    'Corpus (In crs.)',
                    'Expense Ratio (Current)',
                    'Portfolio Turnover Ratio',
                    '%_of_Net_Asset_10(Scheme Portfolio)'
                ]
                
                # Find matching columns (case-insensitive, handle variations and whitespace)
                available_columns = df_cleaned.columns.tolist()
                columns_to_keep = []
                
                for test_col in testing_columns:
                    test_col_clean = test_col.strip()
                    matched = False
                    
                    # Try exact match first
                    if test_col_clean in available_columns:
                        columns_to_keep.append(test_col_clean)
                        matched = True
                    else:
                        # Try case-insensitive match with trimmed whitespace
                        test_col_lower = test_col_clean.lower()
                        for col in available_columns:
                            col_clean = str(col).strip()
                            if col_clean.lower() == test_col_lower:
                                columns_to_keep.append(col)  # Use original column name
                                matched = True
                                break
                    
                    # If still not matched, try partial match for %_of_Net_Asset_10
                    if not matched and '%_of_net_asset_10' in test_col_lower:
                        for col in available_columns:
                            col_lower = str(col).lower().strip()
                            if '%_of_net_asset_10' in col_lower and 'scheme portfolio' in col_lower:
                                columns_to_keep.append(col)
                                matched = True
                                break
                
                # Final check: ensure %_of_Net_Asset_10 column is included
                net_asset_found = False
                for col in columns_to_keep:
                    if '%_of_net_asset_10' in str(col).lower() or '% of net asset' in str(col).lower():
                        net_asset_found = True
                        break
                
                # If not found, search more aggressively
                if not net_asset_found:
                    for col in available_columns:
                        col_lower = str(col).lower().strip()
                        if ('%_of_net_asset' in col_lower or '% of net asset' in col_lower) and 'scheme portfolio' in col_lower:
                            if col not in columns_to_keep:
                                columns_to_keep.append(col)
                            break
                
                # Filter dataframe to only testing columns
                if columns_to_keep:
                    df_filtered = df_cleaned[columns_to_keep]
                else:
                    df_filtered = df_cleaned.copy()
                
                # Convert to CSV
                csv_buffer = io.StringIO()
                df_filtered.to_csv(csv_buffer, index=False)
                csv_data = csv_buffer.getvalue()
                
                # Convert to JSON
                json_data = df_filtered.to_json(orient='records', indent=2, date_format='iso')
                
                response = {
                    'success': True,
                    'csv_data': csv_data,
                    'json_data': json_data,
                    'original_rows': len(df_cleaned),
                    'filtered_rows': len(df_filtered),
                    'columns': columns_to_keep,
                    'columns_count': len(columns_to_keep)
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

                # Handle POST MERGER deletions - accept list of pre-merger row indices to delete
                post_merger_deletions_json = form.getvalue('post_merger_deletions', '')
                post_merger_deleted_count = 0
                post_merger_report = {'deleted': [], 'kept': [], 'skipped': []}
                
                if post_merger_deletions_json:
                    try:
                        post_merger_deletions = json.loads(post_merger_deletions_json)
                        if post_merger_deletions and len(post_merger_deletions) > 0:
                            # post_merger_deletions is a list of pre_merger row indices to delete
                            deletion_set = set(post_merger_deletions)
                            # Filter out deleted pre-merger rows
                            df_cleaned = df_cleaned[~df_cleaned.index.isin(deletion_set)]
                            post_merger_deleted_count = len(post_merger_deletions)
                            # Build report for display
                            for idx in post_merger_deletions:
                                if idx < len(df_cleaned) + post_merger_deleted_count:  # Check if index was valid
                                    post_merger_report['deleted'].append({
                                        'row_index': int(idx),
                                        'scheme_name': 'Pre-merger row'
                                    })
                    except Exception as e:
                        self.send_error_response(400, f'Invalid POST MERGER deletions: {str(e)}')
                        return

                # Handle row exclusion - accept list of row indices to exclude
                exclude_rows_json = form.getvalue('exclude_row_indices', '')
                excluded_count = 0
                
                if exclude_rows_json:
                    try:
                        exclude_indices = json.loads(exclude_rows_json)
                        if exclude_indices and len(exclude_indices) > 0:
                            # Convert to set for faster lookup
                            exclude_set = set(exclude_indices)
                            # Filter out excluded rows
                            df_cleaned = df_cleaned[~df_cleaned.index.isin(exclude_set)]
                            excluded_count = len(exclude_indices)
                    except Exception as e:
                        self.send_error_response(400, f'Invalid row exclusion indices: {str(e)}')
                        return

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
                    'excluded_rows': excluded_count,
                    'post_merger_deleted': post_merger_deleted_count
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
    
    def get_post_merger_candidates(self, df):
        """
        Find POST MERGER duplicate candidates without deleting them.
        Returns candidates for user review.
        
        Returns:
        - candidates: list of dicts with pre_merger and post_merger row info
        - skipped: list of skipped POST MERGER rows with reasons
        """
        candidates = []
        skipped = []
        
        # Check if required columns exist
        scheme_name_col = None
        fund_manager_col = None
        net_asset_col = None
        
        # Find column names (case-insensitive, handle variations)
        for col in df.columns:
            col_lower = str(col).lower()
            if 'scheme name' in col_lower or 'schemename' in col_lower:
                scheme_name_col = col
            elif 'fund manager' in col_lower or 'fundmanager' in col_lower:
                fund_manager_col = col
            elif '%_of_net_asset_10' in col_lower or '% of net asset' in col_lower:
                net_asset_col = col
        
        # If required columns don't exist, return empty
        if not scheme_name_col:
            return candidates, skipped
        
        # If comparison columns don't exist, we can't match
        can_match = fund_manager_col and net_asset_col
        
        # Find POST MERGER rows
        post_merger_indices = []
        for idx, row in df.iterrows():
            scheme_name = str(row[scheme_name_col]) if pd.notna(row[scheme_name_col]) else ''
            if 'post merger' in scheme_name.lower():
                post_merger_indices.append(idx)
        
        # Process each POST MERGER row (from bottom to top)
        post_merger_indices_sorted = sorted(post_merger_indices, reverse=True)
        
        for post_merger_idx in post_merger_indices_sorted:
            post_merger_row = df.iloc[post_merger_idx]
            scheme_name = str(post_merger_row[scheme_name_col]) if pd.notna(post_merger_row[scheme_name_col]) else ''
            
            # Check if row above exists
            if post_merger_idx == 0:
                skipped.append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'no row above'
                })
                continue
            
            # Get row above
            row_above_idx = post_merger_idx - 1
            row_above = df.iloc[row_above_idx]
            row_above_scheme = str(row_above[scheme_name_col]) if pd.notna(row_above[scheme_name_col]) else ''
            
            # Check if row above is also POST MERGER
            if 'post merger' in row_above_scheme.lower():
                skipped.append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'row above is also POST MERGER'
                })
                continue
            
            # If we can't match (missing columns), skip
            if not can_match:
                skipped.append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'missing comparison columns'
                })
                continue
            
            # Get comparison values
            post_merger_fund_manager = str(post_merger_row[fund_manager_col]).strip() if pd.notna(post_merger_row[fund_manager_col]) else ''
            post_merger_net_asset = post_merger_row[net_asset_col] if pd.notna(post_merger_row[net_asset_col]) else None
            
            row_above_fund_manager = str(row_above[fund_manager_col]).strip() if pd.notna(row_above[fund_manager_col]) else ''
            row_above_net_asset = row_above[net_asset_col] if pd.notna(row_above[net_asset_col]) else None
            
            # Check for missing values
            if not post_merger_fund_manager or post_merger_net_asset is None:
                skipped.append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'missing Fund Manager data' if not post_merger_fund_manager else 'missing %_of_Net_Asset_10 data'
                })
                continue
            
            if not row_above_fund_manager or row_above_net_asset is None:
                skipped.append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'row above missing Fund Manager data' if not row_above_fund_manager else 'row above missing %_of_Net_Asset_10 data'
                })
                continue
            
            # Compare Fund Manager (case-insensitive)
            fund_manager_match = post_merger_fund_manager.lower() == row_above_fund_manager.lower()
            
            # Compare %_of_Net_Asset_10 (numeric, handle float comparison)
            try:
                pm_net_asset_val = float(str(post_merger_net_asset).replace('%', '').strip())
                ra_net_asset_val = float(str(row_above_net_asset).replace('%', '').strip())
                net_asset_match = abs(pm_net_asset_val - ra_net_asset_val) < 0.01
            except (ValueError, TypeError):
                net_asset_match = False
            
            # If both match, add as candidate
            if fund_manager_match and net_asset_match:
                # Get full row data for display
                column_names = df.columns.tolist()
                pre_merger_values = [str(row_above[col]) if pd.notna(row_above[col]) else '' for col in column_names]
                post_merger_values = [str(post_merger_row[col]) if pd.notna(post_merger_row[col]) else '' for col in column_names]
                
                candidates.append({
                    'pre_merger': {
                        'row_index': int(row_above_idx),
                        'scheme_name': row_above_scheme,
                        'fund_manager': row_above_fund_manager,
                        'net_asset': str(row_above_net_asset),
                        'values': pre_merger_values
                    },
                    'post_merger': {
                        'row_index': int(post_merger_idx),
                        'scheme_name': scheme_name,
                        'fund_manager': post_merger_fund_manager,
                        'net_asset': str(post_merger_net_asset),
                        'values': post_merger_values
                    }
                })
        
        return candidates, skipped
    
    def process_post_merger_duplicates(self, df):
        """
        Process POST MERGER duplicates:
        - Find rows with "POST MERGER" in scheme name
        - Compare with row above on Fund Manager and %_of_Net_Asset_10
        - Delete pre-merger row if both match
        - Track deleted/kept/skipped rows
        
        Returns:
        - cleaned_df: DataFrame with duplicates removed
        - report: dict with deleted, kept, and skipped rows info
        """
        report = {
            'deleted': [],
            'kept': [],
            'skipped': []
        }
        
        # Check if required columns exist
        scheme_name_col = None
        fund_manager_col = None
        net_asset_col = None
        
        # Find column names (case-insensitive, handle variations)
        for col in df.columns:
            col_lower = str(col).lower()
            if 'scheme name' in col_lower or 'schemename' in col_lower:
                scheme_name_col = col
            elif 'fund manager' in col_lower or 'fundmanager' in col_lower:
                fund_manager_col = col
            elif '%_of_net_asset_10' in col_lower or '% of net asset' in col_lower:
                net_asset_col = col
        
        # If required columns don't exist, return original dataframe
        if not scheme_name_col:
            return df, report
        
        # If comparison columns don't exist, we can still detect POST MERGER but can't match
        can_match = fund_manager_col and net_asset_col
        
        # Find POST MERGER rows
        post_merger_indices = []
        for idx, row in df.iterrows():
            scheme_name = str(row[scheme_name_col]) if pd.notna(row[scheme_name_col]) else ''
            if 'post merger' in scheme_name.lower():
                post_merger_indices.append(idx)
        
        # Process each POST MERGER row (from bottom to top to avoid index shifting issues)
        rows_to_delete = set()
        
        # Sort indices in reverse order (bottom to top)
        post_merger_indices_sorted = sorted(post_merger_indices, reverse=True)
        
        for post_merger_idx in post_merger_indices_sorted:
            post_merger_row = df.iloc[post_merger_idx]
            scheme_name = str(post_merger_row[scheme_name_col]) if pd.notna(post_merger_row[scheme_name_col]) else ''
            
            # Check if row above exists
            if post_merger_idx == 0:
                report['skipped'].append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'no row above'
                })
                continue
            
            # Get row above
            row_above_idx = post_merger_idx - 1
            
            # Check if row above is also POST MERGER
            row_above_scheme = str(df.iloc[row_above_idx][scheme_name_col]) if pd.notna(df.iloc[row_above_idx][scheme_name_col]) else ''
            if 'post merger' in row_above_scheme.lower():
                report['skipped'].append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'row above is also POST MERGER'
                })
                continue
            
            # If we can't match (missing columns), skip
            if not can_match:
                report['skipped'].append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'missing comparison columns'
                })
                continue
            
            # Get comparison values
            post_merger_fund_manager = str(post_merger_row[fund_manager_col]).strip() if pd.notna(post_merger_row[fund_manager_col]) else ''
            post_merger_net_asset = post_merger_row[net_asset_col] if pd.notna(post_merger_row[net_asset_col]) else None
            
            row_above = df.iloc[row_above_idx]
            row_above_fund_manager = str(row_above[fund_manager_col]).strip() if pd.notna(row_above[fund_manager_col]) else ''
            row_above_net_asset = row_above[net_asset_col] if pd.notna(row_above[net_asset_col]) else None
            
            # Check for missing values
            if not post_merger_fund_manager or post_merger_net_asset is None:
                report['skipped'].append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'missing Fund Manager data' if not post_merger_fund_manager else 'missing %_of_Net_Asset_10 data'
                })
                continue
            
            if not row_above_fund_manager or row_above_net_asset is None:
                report['skipped'].append({
                    'row_index': int(post_merger_idx),
                    'scheme_name': scheme_name,
                    'reason': 'row above missing Fund Manager data' if not row_above_fund_manager else 'row above missing %_of_Net_Asset_10 data'
                })
                continue
            
            # Compare Fund Manager (case-insensitive)
            fund_manager_match = post_merger_fund_manager.lower() == row_above_fund_manager.lower()
            
            # Compare %_of_Net_Asset_10 (numeric, handle float comparison)
            try:
                # Convert to float, handle percentage signs
                pm_net_asset_val = float(str(post_merger_net_asset).replace('%', '').strip())
                ra_net_asset_val = float(str(row_above_net_asset).replace('%', '').strip())
                net_asset_match = abs(pm_net_asset_val - ra_net_asset_val) < 0.01  # Small tolerance for floating point
            except (ValueError, TypeError):
                net_asset_match = False
            
            # If both match, mark row above for deletion
            if fund_manager_match and net_asset_match:
                # Safety check: don't delete if row above is already marked or is a POST MERGER row
                if row_above_idx not in rows_to_delete and row_above_idx not in post_merger_indices:
                    rows_to_delete.add(row_above_idx)
                    report['deleted'].append({
                        'row_index': int(row_above_idx),
                        'scheme_name': row_above_scheme
                    })
                    report['kept'].append({
                        'row_index': int(post_merger_idx),
                        'scheme_name': scheme_name
                    })
        
        # Remove duplicate rows
        if rows_to_delete:
            df_cleaned = df[~df.index.isin(rows_to_delete)].reset_index(drop=True)
        else:
            df_cleaned = df.copy()
        
        return df_cleaned, report
    
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
