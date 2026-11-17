// The runner entry: React owns the whole page. The stylesheet is imported here, so esbuild bundles
// and hashes it, and the Node server writes the link into the generated document shell.
import "./app.css";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
