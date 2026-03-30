# Instrucciones para ejecutar en Google Colab:
# 1. Ve a https://colab.research.google.com/ y crea un "Nuevo Cuaderno" (New Notebook).
# 2. Copia todo este código y pégalo en la primera celda.
# 3. Presiona el botón de "Play" (Ejecutar celda).
# 4. Te pedirá permisos para acceder a tu Google Drive. Acepta e inicia sesión con el correo donde tienes las carpetas.

from google.colab import auth
from googleapiclient.discovery import build
import re

print("🔒 Autenticando...")
# 1. Autenticar con tu cuenta personal de Google
auth.authenticate_user()

# 2. Inicializar la API de Drive
drive_service = build('drive', 'v3')

# El ID extraído de tu captura de pantalla para "ROCADURA-007-2ETAPA"
ROCADURA_FOLDER_ID = '1zSKOY7lHNiK04xEtT1jUazK4Ln1-cVIc'

def get_folders():
    folders = []
    page_token = None
    while True:
        results = drive_service.files().list(
            q=f"'{ROCADURA_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed = false",
            fields="nextPageToken, files(id, name, createdTime)",
            pageToken=page_token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            pageSize=1000
        ).execute()
        
        folders.extend(results.get('files', []))
        page_token = results.get('nextPageToken')
        if not page_token:
            break
    return folders

def get_files(folder_id):
    files = []
    page_token = None
    while True:
        results = drive_service.files().list(
            q=f"'{folder_id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'",
            fields="nextPageToken, files(id, name)",
            pageToken=page_token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            pageSize=1000
        ).execute()
        
        files.extend(results.get('files', []))
        page_token = results.get('nextPageToken')
        if not page_token:
            break
    return files

print("📂 Obteniendo carpetas de ROCADURA-007-2ETAPA...")
folders = get_folders()

# Agrupar por nombre
from collections import defaultdict
folders_by_name = defaultdict(list)
for f in folders:
    name = f['name'].strip()
    folders_by_name[name].append(f)

# Filtrar solo las que tienen duplicados
duplicates = {k: v for k, v in folders_by_name.items() if len(v) > 1}
print(f"⚠️ Se encontraron {len(duplicates)} carpetas duplicadas (folios repetidos).")

# Fusionar
for name, folder_list in duplicates.items():
    print(f"\n🔄 Procesando duplicados para el folio: {name}")
    
    # Ordenar por fecha de creación (ascendente, la carpeta más vieja será considerada la 'original')
    folder_list.sort(key=lambda x: x['createdTime'])
    
    target_folder = folder_list[0]
    source_folders = folder_list[1:]
    
    target_id = target_folder['id']
    print(f"  -> Carpeta Original Elegida: {name} (ID: {target_id}) creada el {target_folder['createdTime']}")
    
    # Obtener archivos que ya existen en el target original
    target_files = get_files(target_id)
    target_file_names = {f['name'] for f in target_files}
    
    for source in source_folders:
        source_id = source['id']
        source_files = get_files(source_id)
        print(f"  -> Moviendo {len(source_files)} archivo(s) desde la carpeta duplicada (ID: {source_id})")
        
        for file in source_files:
            file_id = file['id']
            file_name = file['name']
            
            new_name = file_name
            # Si el archivo exacto ya existe, aplicar la lógica de Windows "(1)"
            if file_name in target_file_names:
                match = re.match(r"(.*?)(\.[^.]+)?$", file_name)
                base = match.group(1)
                ext = match.group(2) or ""
                new_name = f"{base} (1){ext}"
                print(f"     ⚠️ Conflicto! Renombrando '{file_name}' a '{new_name}'")
                
                # Descomentar estas líneas si se desea que el script renombre antes de mover
                drive_service.files().update(
                    fileId=file_id,
                    body={'name': new_name},
                    supportsAllDrives=True
                ).execute()
                target_file_names.add(new_name)
            
            print(f"     Moviendo '{new_name}'...")
            drive_service.files().update(
                fileId=file_id,
                addParents=target_id,
                removeParents=source_id,
                supportsAllDrives=True
            ).execute()
        
        print(f"  🗑️ Enviando carpeta duplicada vacía a la papelera...")
        drive_service.files().update(
            fileId=source_id,
            body={'trashed': True},
            supportsAllDrives=True
        ).execute()

print("\n✨ ¡Fusión y limpieza de Rocadura terminada exitosamente!")
