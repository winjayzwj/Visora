import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AdminApp } from "./app";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
    <BrowserRouter basename="/admin">
        <Routes>
            <Route path="*" element={<AdminApp />} />
        </Routes>
    </BrowserRouter>,
);
