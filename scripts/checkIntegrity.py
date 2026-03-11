import os
import json
import xlsxwriter
from googleapiclient.discovery import build
from google.oauth2 import service_account
from tqdm import tqdm

# Configuración
ROOT_FOLDER_ID = '1dzZ1ETLfnrjRCGaokPWx07oZm8zeWvik' # Etapa 2
MIN_SIZE_BYTES = 10240 # 10KB
EXCLUDE_NAMES = {'.DS_Store', 'desktop.ini', 'Thumbs.db'}

def get_drive_service():
    key_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_KEY')
    if not key_json:
        raise ValueError("Falta GOOGLE_SERVICE_ACCOUNT_KEY")
    
    info = json.loads(key_json)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=['https://www.googleapis.com/auth/drive.readonly']
    )
    return build('drive', 'v3', credentials=creds)

def list_files(service, query, fields="nextPageToken, files(id, name, size, mimeType)"):
    files = []
    page_token = None
    while True:
        response = service.files().list(
            q=query,
            fields=fields,
            pageToken=page_token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        files.extend(response.get('files', []))
        page_token = response.get('nextPageToken')
        if not page_token:
            break
    return files

def main():
    service = get_drive_service()
    
    print(f"🔍 Escaneando Contratos en Raíz: {ROOT_FOLDER_ID}...")
    contracts = list_files(service, f"'{ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false")
    
    report_data = {} # {contract_name: [list_of_corrupt_files]}
    summary_stats = [] # [(contract_name, total_files, corrupt_count)]

    # Barra de progreso para Contratos
    for contract in tqdm(contracts, desc="Procesando Contratos", unit="contrato"):
        contract_name = contract['name']
        contract_id = contract['id']
        corrupt_in_contract = []
        total_files_checked = 0
        
        # Listar Folios
        folios = list_files(service, f"'{contract_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false")
        
        for folio in folios:
            folio_name = folio['name']
            folio_id = folio['id']
            
            # Listar Imágenes/Archivos
            items = list_files(service, f"'{folio_id}' in parents and trashed = false")
            
            for item in items:
                # Ignorar carpetas dentro de folios (si existen) y archivos de sistema
                if item['mimeType'] == 'application/vnd.google-apps.folder' or item['name'] in EXCLUDE_NAMES:
                    continue
                
                total_files_checked += 1
                size = item.get('size')
                
                is_corrupt = False
                if size is None:
                    is_corrupt = True
                else:
                    try:
                        if int(size) < MIN_SIZE_BYTES:
                            is_corrupt = True
                    except:
                        is_corrupt = True
                
                if is_corrupt:
                    corrupt_in_contract.append({
                        'folio': folio_name,
                        'file_name': item['name'],
                        'file_id': item['id'],
                        'size': size if size else 'NULL/NONE'
                    })
        
        if corrupt_in_contract:
            report_data[contract_name] = corrupt_in_contract
        
        summary_stats.append({
            'contrato': contract_name,
            'total_archivos': total_files_checked,
            'corruptos': len(corrupt_in_contract)
        })

    # Generar Excel
    print(f"\n📊 Generando Reporte: IntegrityReport.xlsx...")
    workbook = xlsxwriter.Workbook('IntegrityReport.xlsx')
    
    # Formatos
    header_fmt = workbook.add_format({'bold': True, 'bg_color': '#D7E4BC', 'border': 1})
    error_fmt = workbook.add_format({'font_color': 'red'})
    
    # Hoja de Resumen
    summary_sheet = workbook.add_worksheet('Resumen Maestro')
    headers = ['Contrato', 'Total Archivos', 'Archivos Corruptos', 'Estado']
    for col, h in enumerate(headers):
        summary_sheet.write(0, col, h, header_fmt)
    
    for row, stat in enumerate(summary_stats, start=1):
        summary_sheet.write(row, 0, stat['contrato'])
        summary_sheet.write(row, 1, stat['total_archivos'])
        summary_sheet.write(row, 2, stat['corruptos'])
        status = '🔴 CRÍTICO' if stat['corruptos'] > 0 else '🟢 LIMPIO'
        summary_sheet.write(row, 3, status)

    # Hojas por Contrato
    for contract_name, files in report_data.items():
        # Truncar nombre de hoja si es muy largo (máx 31 chars)
        sheet_name = contract_name[:31]
        ws = workbook.add_worksheet(sheet_name)
        
        ws_headers = ['Folio', 'Nombre de Archivo', 'ID de Google Drive', 'Tamaño (Bytes)']
        for col, h in enumerate(ws_headers):
            ws.write(0, col, h, header_fmt)
            
        for row, f in enumerate(files, start=1):
            ws.write(row, 0, f['folio'])
            ws.write(row, 1, f['file_name'])
            ws.write(row, 2, f['file_id'])
            ws.write(row, 3, f['size'], error_fmt)

    workbook.close()
    print("✨ Proceso completado exitosamente.")

if __name__ == '__main__':
    main()
