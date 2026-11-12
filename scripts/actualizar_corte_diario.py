#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
CLIMA SOCIAL · PIPELINE DIARIO DE INGESTA Y ACTUALIZACIÓN DEL TRACKING POLL
Horario de corte oficial: 18:00h
================================================================================
Uso:
  1. Con archivo Excel de Tablas Depuradas:
     python3 scripts/actualizar_corte_diario.py --excel "/ruta/a/Tablas_Depuradas.xlsx" --fecha "Sáb 14 Nov" --push

  2. Ingreso rápido por terminal / CLI:
     python3 scripts/actualizar_corte_diario.py --fecha "Sáb 14 Nov" \
       --pabel 35.8 --burbano 11.2 --yunda 8.9 --merino 6.2 --jijon 2.3 \
       --tonello 27.2 --ubidia 11.5 --zapata 8.1 --cevallos 5.5 \
       --push
"""

import os
import sys
import json
import argparse
import subprocess
from datetime import datetime

TRACKING_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "private", "tracking_data.json")

def normalizar_texto(txt):
    if not txt:
        return ""
    t = str(txt).lower().strip()
    reemplazos = [('á', 'a'), ('é', 'e'), ('í', 'i'), ('ó', 'o'), ('ú', 'u'), ('ñ', 'n')]
    for o, d in reemplazos:
        t = t.replace(o, d)
    return t

def extraer_tablas_excel(excel_path):
    import openpyxl
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    
    # Buscar pestaña oficial de frecuencias ponderadas
    ws_name = None
    for name in wb.sheetnames:
        if 'frecuencias ponderadas' in name.lower():
            ws_name = name
            break
    if not ws_name:
        for name in wb.sheetnames:
            if 'ponderadas' in name.lower() or 'frecuencias' in name.lower():
                ws_name = name
                break
    if not ws_name:
        ws_name = wb.sheetnames[0]
        
    ws = wb[ws_name]
    print(f"✓ Hoja seleccionada: '{ws_name}' ({ws.max_row} filas)")

    tablas = []
    cur_title = None
    cur_pct_col = None
    cur_rows = []

    for r in range(1, ws.max_row + 1):
        a = ws.cell(r, 1).value
        b = ws.cell(r, 2).value
        c = ws.cell(r, 3).value

        # Detectar cabecera de porcentaje
        if c == '%' or b == '%':
            cur_pct_col = 3 if c == '%' else 2
            prev_a = ws.cell(r - 1, 1).value if r > 1 else None
            if cur_rows and cur_title:
                tablas.append((cur_title, cur_rows))
            cur_title = str(prev_a or a or "").strip()
            cur_rows = []
        elif cur_pct_col and a is not None:
            v = ws.cell(r, cur_pct_col).value
            sa = str(a).strip()
            if sa.lower() == 'total' or (isinstance(v, str) and not v.replace('.', '', 1).isdigit()):
                if cur_rows and cur_title:
                    tablas.append((cur_title, cur_rows))
                    cur_rows = []
                cur_pct_col = None
            elif isinstance(v, (int, float)):
                pct_val = round(float(v) * (100.0 if float(v) <= 1.0 else 1.0), 1)
                cur_rows.append((sa, pct_val))
        elif a is None and b is None and c is None:
            if cur_rows and cur_title:
                tablas.append((cur_title, cur_rows))
                cur_rows = []
            cur_pct_col = None

    if cur_rows and cur_title:
        tablas.append((cur_title, cur_rows))

    return tablas

def procesar_datos_desde_excel(excel_path):
    tablas = extraer_tablas_excel(excel_path)
    res = {
        'alcalde': {},
        'prefecto': {},
        'antivoto': {},
        'firmeza': {},
        'pabel_gestion': {},
        'noboa_gestion': {}
    }

    for titulo, filas in tablas:
        t_norm = normalizar_texto(titulo)
        
        # 1. Alcalde de Quito
        if ('alcalde' in t_norm or 'voto para alcalde' in t_norm) and 'nunca' not in t_norm and 'rechazo' not in t_norm and 'segunda' not in t_norm:
            for cat, val in filas:
                c_norm = normalizar_texto(cat)
                if 'pabel' in c_norm: res['alcalde']['pabel'] = val
                elif 'burbano' in c_norm: res['alcalde']['burbano'] = val
                elif 'yunda' in c_norm: res['alcalde']['yunda'] = val
                elif 'merino' in c_norm: res['alcalde']['merino'] = val
                elif 'jijon' in c_norm: res['alcalde']['jijon'] = val
                elif 'blanco' in c_norm or 'nulo' in c_norm: res['alcalde']['nulo_blanco'] = val
                elif 'no sabe' in c_norm or 'indecis' in c_norm: res['alcalde']['indecisos'] = val

        # 2. Rechazo / Antivoto Alcalde
        if 'nunca' in t_norm or 'rechazo' in t_norm:
            for cat, val in filas:
                c_norm = normalizar_texto(cat)
                if 'burbano' in c_norm: res['antivoto']['burbano'] = val
                elif 'pabel' in c_norm: res['antivoto']['pabel'] = val
                elif 'yunda' in c_norm: res['antivoto']['yunda'] = val
                elif 'merino' in c_norm: res['antivoto']['merino'] = val
                elif 'jijon' in c_norm: res['antivoto']['jijon'] = val

        # 3. Prefecto de Pichincha
        if ('prefect' in t_norm or 'voto para prefecto' in t_norm) and 'pabon' not in t_norm:
            for cat, val in filas:
                c_norm = normalizar_texto(cat)
                if 'tonello' in c_norm: res['prefecto']['tonello'] = val
                elif 'ubidia' in c_norm: res['prefecto']['ubidia'] = val
                elif 'zapata' in c_norm: res['prefecto']['zapata'] = val
                elif 'cevallos' in c_norm: res['prefecto']['cevallos'] = val
                elif 'churuchumbi' in c_norm: res['prefecto']['churuchumbi'] = val
                elif 'blanco' in c_norm or 'nulo' in c_norm: res['prefecto']['nulo_blanco'] = val
                elif 'no sabe' in c_norm or 'indecis' in c_norm: res['prefecto']['indecisos'] = val

        # 4. Firmeza del voto
        if 'firmeza' in t_norm or 'decision' in t_norm:
            for cat, val in filas:
                c_norm = normalizar_texto(cat)
                if 'segur' in c_norm or 'definitiv' in c_norm: res['firmeza']['seguro'] = val
                elif 'bland' in c_norm or 'podria' in c_norm or 'cambiar' in c_norm: res['firmeza']['blando'] = val
                elif 'indecis' in c_norm or 'no sabe' in c_norm: res['firmeza']['indeciso'] = val

        # 5. Gestión Pabel Muñoz
        if 'pabel' in t_norm and ('gestion' in t_norm or 'califica' in t_norm or 'labor' in t_norm):
            muy_bien = 0
            bien = 0
            mal = 0
            muy_mal = 0
            for cat, val in filas:
                c_norm = normalizar_texto(cat)
                if 'muy bien' in c_norm: muy_bien = val
                elif 'bien' in c_norm: bien = val
                elif 'muy mal' in c_norm: muy_mal = val
                elif 'mal' in c_norm: mal = val
            pos = round(muy_bien + bien, 1)
            neg = round(mal + muy_mal, 1)
            saldo = round(pos - neg, 1)
            res['pabel_gestion'] = {'positiva': pos, 'negativa': neg, 'saldo': saldo}

        # 6. Gestión Daniel Noboa
        if 'noboa' in t_norm and ('gestion' in t_norm or 'califica' in t_norm or 'labor' in t_norm):
            muy_bien = 0
            bien = 0
            mal = 0
            muy_mal = 0
            for cat, val in filas:
                c_norm = normalizar_texto(cat)
                if 'muy bien' in c_norm: muy_bien = val
                elif 'bien' in c_norm: bien = val
                elif 'muy mal' in c_norm: muy_mal = val
                elif 'mal' in c_norm: mal = val
            pos = round(muy_bien + bien, 1)
            neg = round(mal + muy_mal, 1)
            saldo = round(pos - neg, 1)
            res['noboa_gestion'] = {'positiva': pos, 'negativa': neg, 'saldo': saldo}

    return res

def actualizar_tracking_json(fecha_objetivo, nuevos_datos):
    with open(TRACKING_DATA_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    fechas = data['fechas_reportes']
    
    # Buscar índice de fecha
    target_idx = None
    fecha_obj_norm = normalizar_texto(fecha_objetivo)
    for i, f_str in enumerate(fechas):
        if fecha_obj_norm in normalizar_texto(f_str):
            target_idx = i
            break

    if target_idx is None:
        print(f"❌ Error: La fecha '{fecha_objetivo}' no coincide con ninguna fecha del tracking:")
        print("  Fechas válidas:", fechas)
        sys.exit(1)

    print(f"\n=======================================================")
    print(f"ACTUALIZANDO CORTE: {fechas[target_idx]} (Índice {target_idx})")
    print(f"=======================================================")

    # 1. Actualizar Alcaldía
    if 'alcalde' in nuevos_datos and nuevos_datos['alcalde']:
        for k, v in nuevos_datos['alcalde'].items():
            if k in data['series_alcalde']:
                data['series_alcalde'][k][target_idx] = float(v)
                print(f"  [Alcalde] {k.capitalize()}: {v}%")
        # Mantener alias munoz sincronizado
        if 'pabel' in data['series_alcalde']:
            data['series_alcalde']['munoz'][target_idx] = data['series_alcalde']['pabel'][target_idx]

    # 2. Actualizar Antivoto
    if 'antivoto' in nuevos_datos and nuevos_datos['antivoto']:
        for k, v in nuevos_datos['antivoto'].items():
            if k in data['antivoto_alcalde']:
                data['antivoto_alcalde'][k][target_idx] = float(v)
                print(f"  [Antivoto] {k.capitalize()}: {v}%")
        if 'pabel' in data['antivoto_alcalde']:
            data['antivoto_alcalde']['munoz'][target_idx] = data['antivoto_alcalde']['pabel'][target_idx]

    # 3. Actualizar Prefectura
    if 'prefecto' in nuevos_datos and nuevos_datos['prefecto']:
        for k, v in nuevos_datos['prefecto'].items():
            if k in data['series_prefecto']:
                data['series_prefecto'][k][target_idx] = float(v)
                print(f"  [Prefecto] {k.capitalize()}: {v}%")

    # 4. Actualizar Firmeza
    if 'firmeza' in nuevos_datos and nuevos_datos['firmeza']:
        for k, v in nuevos_datos['firmeza'].items():
            if k in data['firmeza_alcalde']:
                data['firmeza_alcalde'][k][target_idx] = float(v)
                print(f"  [Firmeza] {k.capitalize()}: {v}%")

    # 5. Actualizar Muestra Diaria de Tracking (n del día)
    if 'muestra_diaria' in nuevos_datos and nuevos_datos['muestra_diaria'] is not None:
        if 'muestras_diarias_tracking' not in data:
            data['muestras_diarias_tracking'] = [0] * len(fechas)
        data['muestras_diarias_tracking'][target_idx] = int(nuevos_datos['muestra_diaria'])
        print(f"  [Muestra Diaria] Nuevos casos del día: n = {nuevos_datos['muestra_diaria']}")

    # 5. Actualizar Gestión Pabel
    if 'pabel_gestion' in nuevos_datos and nuevos_datos['pabel_gestion']:
        for k, v in nuevos_datos['pabel_gestion'].items():
            if k in data['gestion_pabel']:
                data['gestion_pabel'][k][target_idx] = float(v)
                print(f"  [Gestión Pabel] {k.capitalize()}: {v}%")

    # 6. Actualizar Gestión Noboa
    if 'noboa_gestion' in nuevos_datos and nuevos_datos['noboa_gestion']:
        for k, v in nuevos_datos['noboa_gestion'].items():
            if k in data['gestion_noboa']:
                data['gestion_noboa'][k][target_idx] = float(v)
                print(f"  [Gestión Noboa] {k.capitalize()}: {v}%")

    # Actualizar corte activo al nuevo día ingresado
    data['corte_activo_inicial'] = target_idx

    # Guardar archivo maestro
    with open(TRACKING_DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\n✓ Archivo actualizado exitosamente: {TRACKING_DATA_PATH}")

    # Replicar a carpeta Descargas
    descargas_path = "/home/alejandro/Descargas/Clima Social/Proyectos/2026.11 · Tracking Poll Quito/02_Pipeline_ETL/tracking_data.json"
    if os.path.exists(os.path.dirname(descargas_path)):
        with open(descargas_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"✓ Sincronizado con Descargas: {descargas_path}")

    return target_idx, fechas[target_idx]

def git_commit_push(fecha_nombre):
    repo_dir = os.path.join(os.path.dirname(__file__), "..")
    print(f"\n--- Desplegando actualización a Render vía GitHub ---")
    try:
        subprocess.run(["git", "add", "."], cwd=repo_dir, check=True)
        msg = f"data: actualización corte oficial {fecha_nombre} (18:00h)"
        subprocess.run(["git", "commit", "-m", msg], cwd=repo_dir, check=True)
        subprocess.run(["git", "push", "origin", "main"], cwd=repo_dir, check=True)
        print(f"✓ Push completado con éxito. Render desplegará el nuevo corte en ~60 segundos.")
    except Exception as e:
        print(f"⚠ Error en git push: {e}")

def main():
    parser = argparse.ArgumentParser(description="Actualizador Diario del Tracking Poll Quito 2026 (18:00h)")
    parser.add_argument("--fecha", required=True, help="Fecha a actualizar (ej: '14 Nov', '15 Nov', 'Dom 15')")
    parser.add_argument("--excel", help="Ruta al archivo Excel de Tablas Depuradas exportado de SPSS")
    parser.add_argument("--push", action="store_true", help="Hacer git commit y push automático a Render")
    
    # Argumentos CLI directos por si se ingresa manual
    parser.add_argument("--pabel", type=float, help="Porcentaje Pabel Muñoz")
    parser.add_argument("--burbano", type=float, help="Porcentaje Harold Burbano")
    parser.add_argument("--yunda", type=float, help="Porcentaje Jorge Yunda")
    parser.add_argument("--merino", type=float, help="Porcentaje Wilson Merino")
    parser.add_argument("--jijon", type=float, help="Porcentaje Bernardo Jijón")
    
    parser.add_argument("--tonello", type=float, help="Porcentaje Alexandro Tonello")
    parser.add_argument("--ubidia", type=float, help="Porcentaje Giovanna Ubidia")
    parser.add_argument("--zapata", type=float, help="Porcentaje Juan Zapata")
    parser.add_argument("--cevallos", type=float, help="Porcentaje Carla Cevallos")
    parser.add_argument("--muestra", "--n", type=int, dest="muestra", help="Número de entrevistas nuevas del día (ej. 170)")

    args = parser.parse_args()

    datos = {'alcalde': {}, 'prefecto': {}, 'antivoto': {}, 'firmeza': {}, 'pabel_gestion': {}, 'noboa_gestion': {}, 'muestra_diaria': args.muestra}

    if args.excel:
        if not os.path.exists(args.excel):
            print(f"❌ Error: Archivo Excel no encontrado en: {args.excel}")
            sys.exit(1)
        print(f"Leyendo Excel oficial de Tablas Depuradas: {args.excel}")
        datos = procesar_datos_desde_excel(args.excel)

    # Sobrescribir con flags CLI si existen
    if args.pabel is not None: datos['alcalde']['pabel'] = args.pabel
    if args.burbano is not None: datos['alcalde']['burbano'] = args.burbano
    if args.yunda is not None: datos['alcalde']['yunda'] = args.yunda
    if args.merino is not None: datos['alcalde']['merino'] = args.merino
    if args.jijon is not None: datos['alcalde']['jijon'] = args.jijon

    if args.tonello is not None: datos['prefecto']['tonello'] = args.tonello
    if args.ubidia is not None: datos['prefecto']['ubidia'] = args.ubidia
    if args.zapata is not None: datos['prefecto']['zapata'] = args.zapata
    if args.cevallos is not None: datos['prefecto']['cevallos'] = args.cevallos

    idx, f_name = actualizar_tracking_json(args.fecha, datos)

    if args.push:
        git_commit_push(f_name)

    print("\n✓ Proceso finalizado con éxito.")

if __name__ == "__main__":
    main()
