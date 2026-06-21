# AIPC Planner

Automatiza la distribución diaria de operaciones del **Aeropuerto Internacional de Punta Cana (PUJ)**:
del pegado de **AMS** genera el **Excel APC** (Correas, Posiciones & Gates) idéntico, y del **PDF Mandos
Medios** arma la **tabla de supervisores** del día — todo en un **correo** listo para enviar.

App web 100 % local (reusa la arquitectura de AeroWeather). Sin servidor ni datos en la nube.

---

## Flujo

1. **Pegar** lo copiado de AMS (16 columnas).
2. **Subir** el PDF *Mandos Medios* (se guarda en el navegador — solo una vez al mes).
3. Elegir el **día** (por defecto mañana).
4. Agregar **destinatarios** y pegar tu **firma**.
5. **Generar** → según el destino:
   - **Outlook**: `.eml` con el **Excel adjunto** + tabla navy en el cuerpo (autolanza en local).
   - **Gmail / webmail**: copia el cuerpo + descarga el Excel para adjuntar a mano.

## Ejecutar

```bash
npm install
npm run serve     # http://localhost:4179
npm test          # pruebas contra archivos reales (parser, OVER, Excel, supervisores, correo)
```

## Reglas de negocio (descubiertas de los archivos, trazables en el código)

- **OVER automático** por fecha (AMS = día/mes): STA día anterior → `OVER` (solo salida, ruta `PUJ-DEST`,
  PAX IN/TRÁNSITO `N/A`); STD día posterior → `OVER` (solo llegada, ruta `ORIGEN-PUJ`, PAX OUT `N/A`).
- **N/A**: PAX vacío o `0` → `N/A`; STAND obligatorio.
- **Orden**: los OVER arriba (por STD), luego el resto por STA.
- **Excel**: se rellena la **plantilla real** (no desde cero) — encabezado verde, datos Arial 16 centrado,
  fila de TOTALES con `=SUM`, FECHA larga en español.
- **Supervisores**: del PDF (por posición) sale quién trabaja + turno; el directorio aporta nombre/teléfono/grupo;
  se excluyen `LIBRE/VAC/TRAINING/HE/…`; se ordenan por hora de inicio.

## Arquitectura

| Módulo | Qué hace |
|---|---|
| `src/amsParse.mjs` | Pegado de AMS (TSV) → vuelos |
| `src/flightTransform.mjs` | Vuelos → filas APC (OVER, N/A, RUTA, orden) |
| `src/xlsxApc.mjs` | Rellena la plantilla `.xlsx` preservando formato (exceljs) |
| `src/pdfSchedule.mjs` | PDF Mandos Medios → turnos por empleado/día (pdf.js, por posición) |
| `src/supervisorEngine.mjs` | Día → grupos de supervisores (clasifica, teléfonos, orden) |
| `src/supervisorTable.mjs` | Grupos → tabla navy del correo |
| `src/emailTemplate.mjs` · `src/eml.mjs` | Cuerpo del correo + `.eml` con adjunto |
| `src/share.mjs` · `server.mjs` | Gmail + servidor local con autolanzar Outlook |

## Configuración

- **Destinatarios** y **firma**: se editan en la web y se guardan en el navegador (no se versionan).
- **Directorio de supervisores** (nombres/teléfonos/grupos): `src/supervisors.config.mjs`.
- **Textos del correo** (asunto, dashboard, slots): `src/config.mjs`.
