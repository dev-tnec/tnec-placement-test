// Dashboard entry: the page shell in index.html carries the icon sprite, the menu host, and the
// toast stack; everything inside #root is React.
import "./admin.css";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
