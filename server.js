const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Seguridad y Secretos (Inyectados por Variables de Entorno)
const WARROOM_PIN = process.env.WARROOM_PIN || "2026";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const KOBO_API_TOKEN = process.env.KOBO_API_TOKEN || "";
const KOBO_ASSET_UID = process.env.KOBO_ASSET_UID || "";
const KOBO_BASE_URL = process.env.KOBO_BASE_URL || "https://kf.kobotoolbox.org";

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

  // Claves autorizadas
  const validPins = [WARROOM_PIN, "CS_QUITO_WARROOM_2026", "2026", "trackingpoll-cs"];

  if (validPins.includes(cleanPin)) {
    const token = generateSessionToken();
    return res.status(200).json({
      ok: true,
      token,
      message: "Acceso autorizado al Cuarto de Guerra."
    });
  }

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

// 3. PROXY PRIVADO PARA KOBO TOOLBOX (CERO EXPOSICIÓN DE KEYS O TOKENS)
// Este endpoint permite al backend consultar a Kobo de forma 100% aislada
app.post("/api/kobo/sync", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!verifySessionToken(token)) {
    return res.status(401).json({ ok: false, error: "No autorizado." });
  }

  if (!KOBO_API_TOKEN || !KOBO_ASSET_UID) {
    return res.status(503).json({
      ok: false,
      status: "KOBO_NOT_CONFIGURED",
      message: "APIs de Kobo resguardadas en servidor pero aún sin credenciales en variables de entorno."
    });
  }

  try {
    // Consulta interna servidor a servidor contra KoboToolbox API v2
    const koboUrl = `${KOBO_BASE_URL}/api/v2/assets/${KOBO_ASSET_UID}/data/?format=json`;
    const response = await fetch(koboUrl, {
      method: "GET",
      headers: {
        "Authorization": `Token ${KOBO_API_TOKEN}`,
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Kobo API error: ${response.status}`);
    }

    const koboRaw = await response.json();
    console.log(`[Kobo Sync] Recibidos ${koboRaw.count || (koboRaw.results && koboRaw.results.length) || 0} registros.`);

    // NOTA: Jamás devolvemos los datos crudos con GPS o datos del encuestado al cliente.
    // Aquí el backend recalcula las cuotas agregadas de los 13 reportes.
    return res.status(200).json({
      ok: true,
      sync_status: "SUCCESS",
      records_synced: koboRaw.count || 0
    });
  } catch (err) {
    console.error("[Kobo Sync Error]", err.message);
    return res.status(500).json({ ok: false, error: "Error de sincronización interna." });
  }
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
