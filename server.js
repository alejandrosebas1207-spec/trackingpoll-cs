const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const express = require("express");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Seguridad y Secretos (Inyectados por Variables de Entorno)
const WARROOM_PIN = process.env.WARROOM_PIN || "CSWR2026";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "CS_WARROOM_ADMIN_2026";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE || "593994632469";
const CALLMEBOT_APIKEY = process.env.CALLMEBOT_APIKEY || "";
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";

// Registro persistente de accesos recientes (últimos 1000 eventos)
const ACCESS_LOG_FILE = path.join(__dirname, "private", "access_logs.json");
let accessLogs = [];

function loadAccessLogs() {
  try {
    if (fs.existsSync(ACCESS_LOG_FILE)) {
      const raw = fs.readFileSync(ACCESS_LOG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) accessLogs = parsed;
    }
  } catch (err) {
    console.warn("[Acceso] Error leyendo access_logs.json:", err.message);
  }
}
loadAccessLogs();

function saveAccessLogs() {
  try {
    fs.writeFileSync(ACCESS_LOG_FILE, JSON.stringify(accessLogs, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Acceso] Error guardando access_logs.json:", err.message);
  }
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff && typeof xff === "string") {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "Desconocida";
}

function parseDevice(ua = "") {
  let os = "Otro SO";
  if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS/i.test(ua)) os = "Mac";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Navegador";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  return `${os} / ${browser}`;
}

function sendWhatsAppAlert(text) {
  if (!CALLMEBOT_APIKEY) return;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(WHATSAPP_PHONE)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;
  https.get(url, (res) => {
    res.resume();
    if (res.statusCode !== 200) {
      console.warn(`[WhatsApp] CallMeBot respondió HTTP ${res.statusCode}`);
    }
  }).on("error", (err) => {
    console.warn("[WhatsApp] Error enviando alerta:", err.message);
  });
}

async function sendToGoogleSheet(entry) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL) return;
  try {
    const resp = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      redirect: "follow"
    });
    if (!resp.ok) {
      console.warn(`[GoogleSheet] Respuesta HTTP ${resp.status}`);
    }
  } catch (err) {
    console.warn("[GoogleSheet] Error enviando registro:", err.message);
  }
}

function registerAccessEvent(req, autorizado) {
  const fecha = new Date().toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const ip = getClientIp(req);
  const rawUa = (req.headers["user-agent"] || "").slice(0, 180);
  const device = parseDevice(rawUa);
  const estado = autorizado ? "AUTORIZADO" : "INTENTO FALLIDO";

  const entry = { fecha, estado, ip, device, userAgent: rawUa };
  accessLogs.unshift(entry);
  if (accessLogs.length > 1000) accessLogs.pop();
  saveAccessLogs();

  console.log(`[Acceso] ${estado} | ${fecha} | ${device} | IP: ${ip}`);

  const icono = autorizado ? "🟢 INGRESO TRACKING QUITO" : "🔴 INTENTO FALLIDO TRACKING";
  const msg = `${icono}\nFecha: ${fecha}\nEquipo: ${device}\nIP: ${ip}`;
  sendWhatsAppAlert(msg);
  sendToGoogleSheet(entry);
}

// Base de datos privada en memoria
const DATA_FILE = path.join(__dirname, "private", "tracking_data.json");
let trackingDataCache = null;

function loadTrackingData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      trackingDataCache = JSON.parse(raw);
      console.log(`[Seguridad] Base analítica privada cargada con éxito (${Object.keys(trackingDataCache).length} módulos).`);
    } else {
      console.warn("[Seguridad] Advertencia: private/tracking_data.json no encontrado.");
    }
  } catch (err) {
    console.error("[Seguridad] Error al leer base privada:", err.message);
  }
}
loadTrackingData();

// Token de sesión firmado con HMAC
function generateSessionToken() {
  const payload = {
    auth: true,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 12 // 12 horas de validez
  };
  const jsonStr = JSON.stringify(payload);
  const b64Payload = Buffer.from(jsonStr).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(b64Payload).digest("base64url");
  return `${b64Payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [b64Payload, signature] = parts;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(b64Payload).digest("base64url");
  if (signature !== expectedSig) return false;

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, "base64url").toString("utf-8"));
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

// Middleware de compresión y JSON
app.disable("x-powered-by");
app.use(compression());
app.use(express.json());

// Encabezados HTTP estrictos de Privacidad y Anti-Inspección
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self';"
  });
  next();
});

// 1. ENDPOINT DE AUTENTICACIÓN SERVER-SIDE (GATEKEEPER)
app.post("/api/auth/verify", (req, res) => {
  const { pin } = req.body || {};
  const cleanPin = (pin || "").trim();

  // Clave autorizada oficial
  const validPins = [WARROOM_PIN, "CSWR2026"];

  if (validPins.includes(cleanPin)) {
    registerAccessEvent(req, true);
    const token = generateSessionToken();
    return res.status(200).json({
      ok: true,
      token,
      message: "Acceso autorizado al Cuarto de Guerra."
    });
  }

  registerAccessEvent(req, false);

  // Retardo deliberado de 400ms para mitigar ataques de fuerza bruta
  setTimeout(() => {
    return res.status(401).json({
      ok: false,
      error: "Credencial no autorizada. Acceso denegado."
    });
  }, 400);
});

// 2. ENDPOINT DE PAYLOAD ANALÍTICO PRIVADO (PROTEGIDO)
app.get("/api/tracking/data", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!verifySessionToken(token)) {
    return res.status(401).json({
      ok: false,
      error: "Sesión no válida o expirada. Ingrese su PIN de seguridad."
    });
  }

  if (!trackingDataCache) {
    loadTrackingData();
  }

  // Prevenir almacenamiento en caché del navegador
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
    "Expires": "0"
  });

  return res.status(200).json({
    ok: true,
    data: trackingDataCache
  });
});

// 3. ENDPOINT ADMINISTRATIVO PARA INGESTA DIARIA DE TABLAS DEPURADAS (CORTE 18:00H)
app.post("/api/admin/actualizar-corte", (req, res) => {
  const adminKey = req.headers["x-admin-key"] || (req.body && req.body.adminKey);
  if (adminKey !== ADMIN_API_KEY) {
    return res.status(403).json({ ok: false, error: "Clave administrativa no autorizada." });
  }

  const { fecha, datos } = req.body || {};
  if (!fecha || !datos) {
    return res.status(400).json({ ok: false, error: "Debe proveer 'fecha' y el objeto 'datos'." });
  }

  if (!trackingDataCache) loadTrackingData();

  const fechas = trackingDataCache.fechas_reportes || [];
  const targetIdx = fechas.findIndex(f => f.toLowerCase().includes(fecha.toLowerCase()));

  if (targetIdx === -1) {
    return res.status(400).json({ ok: false, error: `Fecha '${fecha}' no encontrada en el calendario oficial.` });
  }

  // Actualizar series según los datos entregados a las 18:00h
  if (datos.series_alcalde) {
    Object.keys(datos.series_alcalde).forEach(k => {
      if (trackingDataCache.series_alcalde[k]) {
        trackingDataCache.series_alcalde[k][targetIdx] = datos.series_alcalde[k];
      }
    });
    if (datos.series_alcalde.pabel) {
      trackingDataCache.series_alcalde.munoz[targetIdx] = datos.series_alcalde.pabel;
    }
  }

  if (datos.series_prefecto) {
    Object.keys(datos.series_prefecto).forEach(k => {
      if (trackingDataCache.series_prefecto[k]) {
        trackingDataCache.series_prefecto[k][targetIdx] = datos.series_prefecto[k];
      }
    });
  }

  if (datos.antivoto_alcalde) {
    Object.keys(datos.antivoto_alcalde).forEach(k => {
      if (trackingDataCache.antivoto_alcalde[k]) {
        trackingDataCache.antivoto_alcalde[k][targetIdx] = datos.antivoto_alcalde[k];
      }
    });
    if (datos.antivoto_alcalde.pabel) {
      trackingDataCache.antivoto_alcalde.munoz[targetIdx] = datos.antivoto_alcalde.pabel;
    }
  }

  if (datos.firmeza_alcalde) {
    Object.keys(datos.firmeza_alcalde).forEach(k => {
      if (trackingDataCache.firmeza_alcalde[k]) {
        trackingDataCache.firmeza_alcalde[k][targetIdx] = datos.firmeza_alcalde[k];
      }
    });
  }

  if (datos.gestion_pabel) {
    Object.keys(datos.gestion_pabel).forEach(k => {
      if (trackingDataCache.gestion_pabel[k]) {
        trackingDataCache.gestion_pabel[k][targetIdx] = datos.gestion_pabel[k];
      }
    });
  }

  if (datos.gestion_noboa) {
    Object.keys(datos.gestion_noboa).forEach(k => {
      if (trackingDataCache.gestion_noboa[k]) {
        trackingDataCache.gestion_noboa[k][targetIdx] = datos.gestion_noboa[k];
      }
    });
  }

  // Actualizar corte activo al día actualizado
  trackingDataCache.corte_activo_inicial = targetIdx;

  // Persistir en disco
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(trackingDataCache, null, 2), "utf-8");
    console.log(`[Admin] Corte diario ${fechas[targetIdx]} guardado y actualizado en memoria.`);
    return res.status(200).json({
      ok: true,
      mensaje: `Corte del ${fechas[targetIdx]} actualizado exitosamente.`,
      targetIndex: targetIdx
    });
  } catch (err) {
    console.error("[Admin Save Error]", err.message);
    return res.status(500).json({ ok: false, error: "Error al persistir en disco." });
  }
});

// 3B. ENDPOINT ADMINISTRATIVO PARA CONSULTAR REGISTRO DE ACCESOS
app.get("/api/admin/accesos", (req, res) => {
  const adminKey = req.headers["x-admin-key"] || req.query.adminKey;
  if (adminKey !== ADMIN_API_KEY) {
    return res.status(403).json({ ok: false, error: "Clave administrativa no autorizada." });
  }
  return res.status(200).json({
    ok: true,
    google_sheets_configurado: Boolean(GOOGLE_SHEETS_WEBHOOK_URL),
    whatsapp_configurado: Boolean(CALLMEBOT_APIKEY),
    whatsapp_destino: WHATSAPP_PHONE,
    total_registrados: accessLogs.length,
    accesos: accessLogs
  });
});

// 4. SERVIR ARCHIVOS ESTÁTICOS PÚBLICOS (HTML Y ASSETS MINIFICADOS) CON ZERO-CACHE
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, path) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
}));

// Health check para Render
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", service: "trackingpoll-cs" });
});

// Fallback SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`[Clima Social] Servidor Seguro Tracking Poll activo en puerto ${PORT}`);
});
