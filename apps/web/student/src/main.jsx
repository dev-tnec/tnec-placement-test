// The runner entry: React owns the whole page. The stylesheet is imported here, so Vite bundles
// and hashes it and writes the link into the built index.html. Never add a stylesheet link to
// index.html by hand.
import "./app.css";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
