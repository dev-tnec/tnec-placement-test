// Print button on a certificate page. It lives in its own file because the page sends a strict CSP.
document.getElementById("cert-print")?.addEventListener("click", () => window.print());
