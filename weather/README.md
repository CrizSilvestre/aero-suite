# AeroWeather

Convierte el PDF de **ONAMET** (*Pronóstico Regional del Este y Marino para Punta Cana y áreas vecinas*)
en un **correo corporativo listo para enviar** — Asunto `Weather`, distribución por **CCO**, fuente
**Arial 12 pt** e imágenes meteorológicas incrustadas. Soporta **Outlook** y **Gmail / webmail**.

Pensado para el equipo de Operaciones del **Aeropuerto Internacional de Punta Cana (PUJ)**.

- App en vivo: https://crizsilvestre.github.io/aeroweather/
- Repo: https://github.com/CrizSilvestre/aeroweather

> 100 % local: el PDF y las imágenes se procesan **dentro del navegador**. Nada se sube a Internet.

---

## Flujo del usuario

1. **Subir** el PDF de ONAMET (arrastrar y soltar).
2. **Subir** las imágenes (Radar/Satélite y Windy): arrastrar, clic, o **pegar con ⌘/Ctrl+V**
   pasando el cursor por la zona. Se muestran en el correo a un **ancho fijo de 530 px**.
3. (Una vez) **pegar tu firma** de Outlook en *Mi firma*; marcar *Viñetas en Condiciones Generales* si las usas.
4. **Revisar** la vista previa y la lista de validación.
5. **Generar** según el destino elegido:
   - **Outlook** → descarga `Weather-AAAA-MM-DD.eml`; doble clic abre el **borrador** (Asunto, CCO,
     Arial 12, imágenes). Corriendo en local con `npm run serve`, **autolanza Outlook** sin descargar.
   - **Gmail / webmail** → copia el correo con formato y abre Gmail con Asunto + CCO; **pega (⌘/Ctrl+V)** y envía.

## Ejecutar en local

```bash
npm install      # solo la primera vez (descarga pdf.js)
npm run serve    # http://localhost:4178
```

No requiere build. Para producción basta con **servir la carpeta como sitio estático** (GitHub Pages,
IIS interno, SharePoint, Azure Static Web Apps, etc.).

## Pruebas

```bash
npm test         # valida el parser y el .eml contra un PDF real de ONAMET
```

## Outlook y Gmail

Un navegador no puede controlar Outlook directamente. Para un correo **HTML con imágenes y CCO**:
- **Outlook:** se genera un `.eml` con la cabecera `X-Unsent: 1` → al abrirlo, Outlook lo trata como
  **borrador en redacción**. En local, el servidor expone `POST /api/open-eml` que lo **abre solo**
  (en GitHub Pages no hay servidor, así que cae a descarga).
- **Gmail:** se copia el HTML enriquecido al portapapeles y se abre Gmail con Asunto + CCO; el usuario pega una vez.

## Arquitectura

Cliente puro, sin base de datos. Lógica separada de la UI para poder probarla:

| Módulo | Responsabilidad |
|---|---|
| `src/pdfText.mjs` | Reconstruye líneas de texto desde pdf.js |
| `src/parser.mjs` | Texto ONAMET → estructura (fecha, secciones, días, sol) |
| `src/emailTemplate.mjs` | Estructura → HTML corporativo fijo (Arial 12 pt) |
| `src/eml.mjs` | HTML + imágenes → `.eml` con `X-Unsent` (+ autolanzar en local) |
| `src/share.mjs` | Copiar correo + abrir Gmail (destino webmail) |
| `src/imageResize.mjs` | Lee la imagen a resolución completa; el correo la muestra al ancho fijo |
| `src/validate.mjs` | Checklist previo (PDF, secciones, imágenes, CCO) |
| `src/config.mjs` | Valores por defecto (asunto, fuente, ancho de imagen) |
| `app.mjs` | Orquestación de la interfaz |
| `server.mjs` | Servidor estático local + endpoint para autolanzar Outlook |
| `vendor/` | pdf.js incrustado (funciona **offline**) |

## Configuración

- **CCO:** `defaultBcc` queda **vacío** a propósito. Cada usuario agrega la lista en la web (se guarda
  en su navegador). **No commitear correos reales** en este repo público.
- **Firma:** cada agente pega la suya en *Mi firma* (se guarda en el navegador, **no se versiona**).
- **Ancho de imágenes:** `src/config.mjs` → `image.width` (530 px). Hay un control en la web para ajustarlo.
- **Asunto** fijo `Weather`; **fuente** Arial 12 pt; **estructura** del correo fija (mandato corporativo).

## Seguridad

- El PDF y las imágenes **nunca salen del navegador**.
- El repo y GitHub Pages son **públicos**: la lista de distribución y las firmas **no van en el código**
  (viven en `localStorage` del navegador de cada usuario).

## Roadmap

- **Fase 2:** Add-in de Outlook (Office.js) — autolanzar el borrador con un clic para **todos** (no solo en local).
- **Fase 3:** Microsoft Graph / Power Automate para detectar el correo de ONAMET y crear el borrador
  automáticamente; historial, usuarios, estadísticas y validación con IA.
