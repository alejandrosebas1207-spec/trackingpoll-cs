const path = require("path");
const express = require("express");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.json());

// Encabezados de seguridad
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "no-referrer"
  });
  next();
});

// Servir archivos estáticos del tablero
app.use(express.static(path.join(__dirname, "public")));

// Endpoint de health check para Render
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", service: "trackingpoll-cs" });
});

// Fallback a index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`[Clima Social] Servidor Tracking Poll activo en el puerto ${PORT}`);
});
